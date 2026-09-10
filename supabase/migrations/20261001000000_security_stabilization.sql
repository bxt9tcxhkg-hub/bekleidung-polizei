CREATE OR REPLACE FUNCTION public.protect_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_staff boolean;
  is_status_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Die Benutzer-ID kann nicht geändert werden';
  END IF;
  IF NOT has_role('admin') THEN
    IF ('admin' = ANY(OLD.roles) AND NEW IS DISTINCT FROM OLD)
       OR ('admin' = ANY(NEW.roles)) IS DISTINCT FROM ('admin' = ANY(OLD.roles)) THEN
      RAISE EXCEPTION 'Nur Admins dürfen Adminprofile oder Adminrechte ändern';
    END IF;
    IF NOT (has_role('genehmiger') OR has_role('approver')) AND
      (ARRAY(SELECT unnest(NEW.roles) INTERSECT SELECT unnest(ARRAY['genehmiger','approver']))
       IS DISTINCT FROM ARRAY(SELECT unnest(OLD.roles) INTERSECT SELECT unnest(ARRAY['genehmiger','approver']))) THEN
      RAISE EXCEPTION 'Keine Berechtigung, Genehmigerrechte zu ändern';
    END IF;
  END IF;

  is_staff := has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver');
  is_status_staff := has_role('admin') OR has_role('genehmiger') OR has_role('approver');

  IF NEW.active IS DISTINCT FROM OLD.active
     AND NOT is_status_staff THEN
    RAISE EXCEPTION 'Keine Berechtigung, den Benutzerstatus zu ändern';
  END IF;

  IF NEW.force_username_set IS DISTINCT FROM OLD.force_username_set
     AND NOT is_staff THEN
    IF NOT (
      NEW.id = auth.uid()
      AND OLD.force_username_set IS TRUE
      AND NEW.force_username_set IS FALSE
    ) THEN
      RAISE EXCEPTION 'Keine Berechtigung, diese Profilfelder zu ändern';
    END IF;
  END IF;

  IF NEW.roles IS DISTINCT FROM OLD.roles
     OR NEW.organisation IS DISTINCT FROM OLD.organisation THEN
    IF NOT is_staff THEN
      RAISE EXCEPTION 'Keine Berechtigung, diese Profilfelder zu ändern';
    END IF;
  END IF;

  IF NEW.username IS DISTINCT FROM OLD.username
     AND NOT is_staff THEN
    IF NOT (NEW.id = auth.uid() AND OLD.force_username_set IS TRUE) THEN
      RAISE EXCEPTION 'Keine Berechtigung, diese Profilfelder zu ändern';
    END IF;
  END IF;

  RETURN NEW;
END $function$

CREATE OR REPLACE FUNCTION public.update_editable_order(p_order_id uuid, p_size text, p_quantity integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  target public.orders%ROWTYPE;
  order_year integer;
  total_budget_amount numeric;
  used_adjustment_amount numeric;
  other_orders_amount numeric;
  new_status text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = uid AND active = true FOR NO KEY UPDATE;
  IF NOT FOUND OR NOT public.has_portal_area_access('bekleidung') THEN
    RAISE EXCEPTION 'Kein Zugriff auf Bekleidung';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Ungültige Menge';
  END IF;

  IF p_size IS NULL OR btrim(p_size) = '' THEN
    RAISE EXCEPTION 'Ungültige Größe';
  END IF;

  SELECT * INTO target
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR target.user_id <> uid THEN
    RAISE EXCEPTION 'Bestellung nicht gefunden';
  END IF;

  IF target.status NOT IN ('approved', 'pending_approval')
     OR target.delivery_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bestellung wurde bereits bestellt';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = target.product_id
      AND p_size = ANY (p.sizes)
  ) THEN
    RAISE EXCEPTION 'Größe ist für diesen Artikel nicht verfügbar';
  END IF;

  order_year := extract(year FROM target.created_at)::integer;

  SELECT coalesce(
    (SELECT ub.total_budget
     FROM public.user_budgets ub
     WHERE ub.user_id = uid
       AND ub.year = order_year
       AND ub.valid_from <= current_date
     ORDER BY ub.valid_from DESC
     LIMIT 1),
    350
  ) INTO total_budget_amount;

  SELECT coalesce(
    (SELECT ub.used_adjustment
     FROM public.user_budgets ub
     WHERE ub.user_id = uid
       AND ub.year = order_year
       AND ub.valid_from <= current_date
     ORDER BY ub.valid_from DESC
     LIMIT 1),
    0
  ) INTO used_adjustment_amount;

  SELECT coalesce(sum(o.unit_price * o.quantity), 0)
  INTO other_orders_amount
  FROM public.orders o
  WHERE o.user_id = uid
    AND o.id <> target.id
    AND o.status NOT IN ('pending', 'cancelled')
    AND o.created_at >= make_date(order_year, 1, 1)
    AND o.created_at < make_date(order_year + 1, 1, 1);

  new_status := CASE
    WHEN other_orders_amount + used_adjustment_amount + target.unit_price * p_quantity > total_budget_amount
      THEN 'pending_approval'
    ELSE 'approved'
  END;

  UPDATE public.orders
  SET size = p_size,
      quantity = p_quantity,
      status = new_status,
      updated_at = now()
  WHERE id = target.id;

  INSERT INTO public.audit_log (action, details, user_id)
  VALUES (
    'Bestellung durch Benutzer geändert',
    format('Bestellung %s: Größe %s → %s, Menge %s → %s', target.id, target.size, p_size, target.quantity, p_quantity),
    uid
  );

  RETURN new_status;
END;
$function$
-- Replace permissive duplicate owner policies; staff workflow policies remain.
CREATE OR REPLACE FUNCTION public.is_active_portal_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND active)
$$;
REVOKE ALL ON FUNCTION public.is_active_portal_user() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_active_portal_user() TO authenticated;
DO $$
DECLARE tab record;
BEGIN
  FOR tab IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
  LOOP
    EXECUTE format('CREATE POLICY active_portal_user ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.is_active_portal_user())) WITH CHECK ((SELECT public.is_active_portal_user()))',tab.relname);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Sachbearbeiter can manage deliveries" ON public.deliveries;
DROP POLICY IF EXISTS "Benutzer legt Bestellung an" ON public.orders;
DROP POLICY IF EXISTS "Benutzer erstellt Warenkorb" ON public.orders;
CREATE POLICY "Benutzer erstellt Warenkorb" ON public.orders FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending' AND public.has_portal_area_access('bekleidung'));
DROP POLICY IF EXISTS "Benutzer bearbeitet eigene Bestellungen" ON public.orders;

CREATE OR REPLACE FUNCTION public.guard_cart_order()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE article public.products%ROWTYPE;
BEGIN
  -- Definer RPCs validate their own transitions. Direct Data API writes cannot bypass this guard.
  IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
  IF NOT public.has_portal_area_access('bekleidung') THEN RAISE EXCEPTION 'Kein Zugriff auf Bekleidung'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id <> auth.uid() OR NEW.status <> 'pending'
       OR coalesce(NEW.quantity_received,0) <> 0 OR coalesce(NEW.quantity_issued,0) <> 0
       OR NEW.delivery_id IS NOT NULL OR NEW.tailor_job_id IS NOT NULL OR coalesce(NEW.proc_listed,false)
       OR NEW.cancel_reason IS NOT NULL OR NEW.shifted_from IS NOT NULL THEN
      RAISE EXCEPTION 'Bestellungen müssen im Warenkorb angelegt werden';
    END IF;
    NEW.created_at := now();
    NEW.updated_at := now();
  ELSIF NOT (has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver')) THEN
    IF OLD.status <> 'pending' OR NEW.status <> 'pending' OR
      (to_jsonb(NEW) - ARRAY['quantity','size','unit_price','updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['quantity','size','unit_price','updated_at']) THEN
      RAISE EXCEPTION 'Nur Größe und Menge des Warenkorbs können direkt geändert werden';
    END IF;
  ELSIF NOT (has_role('admin') OR has_role('sachbearbeiter')) AND OLD.status <> 'pending' THEN
    IF (to_jsonb(NEW) - ARRAY['status','cancel_reason','updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','cancel_reason','updated_at']) THEN
      RAISE EXCEPTION 'Genehmiger dürfen nur die Genehmigung ändern';
    END IF;
  END IF;
  IF NEW.status = 'pending' THEN
    SELECT * INTO article FROM public.products WHERE id = NEW.product_id AND active;
    IF NOT FOUND OR NEW.quantity IS NULL OR NEW.quantity < 1 OR NOT coalesce(NEW.size = ANY(article.sizes),false) THEN
      RAISE EXCEPTION 'Artikel, Größe oder Menge ungültig';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND active AND organisation = article.organisation) THEN
      RAISE EXCEPTION 'Artikel gehört nicht zur Organisation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.quarters WHERE id = NEW.quarter_id AND status = 'active') THEN
      RAISE EXCEPTION 'Bestellquartal ist nicht aktiv';
    END IF;
    NEW.unit_price := article.price;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_cart_order BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_cart_order();

CREATE OR REPLACE FUNCTION public.submit_cart()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  yr integer := extract(year FROM now())::integer;
  budget numeric; used numeric; cart numeric; new_status text;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = uid AND active FOR NO KEY UPDATE;
  IF NOT FOUND OR NOT public.has_portal_area_access('bekleidung') THEN RAISE EXCEPTION 'Kein Zugriff auf Bekleidung'; END IF;
  PERFORM 1 FROM public.orders WHERE user_id = uid AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM public.orders o
    LEFT JOIN public.products p ON p.id = o.product_id
    LEFT JOIN public.quarters q ON q.id = o.quarter_id
    JOIN public.profiles u ON u.id = o.user_id
    WHERE o.user_id = uid AND o.status = 'pending' AND
      (p.id IS NULL OR NOT p.active OR q.status IS DISTINCT FROM 'active' OR o.quantity < 1
       OR NOT coalesce(o.size = ANY(p.sizes),false) OR p.organisation IS DISTINCT FROM u.organisation)
  ) THEN RAISE EXCEPTION 'Warenkorb enthält nicht mehr verfügbare Artikel oder ein geschlossenes Quartal'; END IF;
  UPDATE public.orders o SET unit_price = p.price FROM public.products p
    WHERE o.product_id = p.id AND o.user_id = uid AND o.status = 'pending';
  SELECT coalesce((SELECT total_budget FROM public.user_budgets
    WHERE user_id = uid AND year = yr AND valid_from <= current_date ORDER BY valid_from DESC LIMIT 1),350) INTO budget;
  SELECT coalesce(sum(unit_price*quantity),0) + coalesce((SELECT used_adjustment FROM public.user_budgets
    WHERE user_id=uid AND year=yr AND valid_from<=current_date ORDER BY valid_from DESC LIMIT 1),0)
    INTO used FROM public.orders WHERE user_id=uid AND status NOT IN ('pending','cancelled')
    AND created_at>=make_date(yr,1,1) AND created_at<make_date(yr+1,1,1);
  SELECT coalesce(sum(unit_price*quantity),0) INTO cart FROM public.orders WHERE user_id=uid AND status='pending';
  new_status := CASE WHEN used+cart>budget THEN 'pending_approval' ELSE 'approved' END;
  UPDATE public.orders SET status=new_status,updated_at=now() WHERE user_id=uid AND status='pending';
  RETURN new_status;
END $$;

-- Client audit messages are supplemental, authoritative critical changes are recorded by triggers.
ALTER TABLE public.audit_log ADD COLUMN source text NOT NULL DEFAULT 'client' CHECK (source IN ('client','database'));
DROP POLICY IF EXISTS "Alle können Einträge schreiben" ON public.audit_log;
DROP POLICY IF EXISTS "Angemeldete schreiben Protokoll" ON public.audit_log;
CREATE POLICY "Eigene ergänzende Protokolle" ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND source = 'client'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND active));
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION private.audit_critical_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_id text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN row_id := to_jsonb(OLD)->>'id'; ELSE row_id := to_jsonb(NEW)->>'id'; END IF;
  INSERT INTO public.audit_log(user_id,action,details,source)
    VALUES(auth.uid(),TG_TABLE_NAME || ':' || TG_OP, 'Datensatz ' || coalesce(row_id,'ohne ID'),'database');
  RETURN NULL;
END $$;
DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['profiles','portal_area_roles','orders','inventory','stock_orders','pool_einsatzmittel',
    'einsatz_training_sessions','einsatz_training_attendance','einsatz_training_participations','einsatz_training_completions','einsatz_training_modules','einsatz_materials']
  LOOP
    EXECUTE format('CREATE TRIGGER audit_critical_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.audit_critical_change()',tab);
  END LOOP;
END $$;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- A parent deletion must never silently erase individually maintained training records.
CREATE OR REPLACE FUNCTION public.guard_training_session_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(OLD.munition_anzahl,0)>0
    OR EXISTS(SELECT 1 FROM einsatz_training_registrations WHERE session_id=OLD.id)
    OR EXISTS(SELECT 1 FROM einsatz_training_attendance WHERE session_id=OLD.id)
    OR EXISTS(SELECT 1 FROM einsatz_training_participations WHERE session_id=OLD.id)
    OR EXISTS(SELECT 1 FROM einsatz_training_completions WHERE session_id=OLD.id) THEN
    RAISE EXCEPTION 'Trainingstag hat verknüpfte Einträge oder Munitionsverbrauch. Bitte die betreffenden Einträge zuerst einzeln prüfen und entfernen.';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER guard_training_session_delete BEFORE DELETE ON public.einsatz_training_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_training_session_delete();

CREATE OR REPLACE FUNCTION public.remove_training_attendance(p_attendance_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE target public.einsatz_training_attendance%ROWTYPE;
BEGIN
  IF NOT can_manage_einsatzmittel() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO target FROM einsatz_training_attendance WHERE id=p_attendance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anwesenheit nicht gefunden'; END IF;
  DELETE FROM einsatz_training_participations WHERE session_id=target.session_id AND officer_id=target.officer_id;
  DELETE FROM einsatz_training_attendance WHERE id=target.id;
END $$;

CREATE OR REPLACE FUNCTION public.save_training_munition(
  p_session_id uuid, p_previous_pool_id uuid, p_previous_quantity integer,
  p_pool_id uuid, p_quantity integer, p_marke text, p_kaliber text, p_art text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE target public.einsatz_training_sessions%ROWTYPE; stock public.pool_einsatzmittel%ROWTYPE; delta integer;
BEGIN
  IF NOT can_manage_einsatzmittel() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO target FROM einsatz_training_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trainingstag nicht gefunden'; END IF;
  IF target.munition_pool_id IS DISTINCT FROM p_previous_pool_id OR target.munition_anzahl IS DISTINCT FROM p_previous_quantity THEN
    RAISE EXCEPTION 'Verbrauch wurde zwischenzeitlich geändert. Bitte neu laden.';
  END IF;
  IF p_quantity IS NULL OR p_quantity<0 OR (p_quantity>0 AND p_pool_id IS NULL)
    OR (p_quantity=0 AND p_pool_id IS NOT NULL) THEN RAISE EXCEPTION 'Ungültiger Verbrauch'; END IF;
  FOR stock IN SELECT * FROM pool_einsatzmittel WHERE id IN (target.munition_pool_id,p_pool_id) ORDER BY id FOR UPDATE
  LOOP
    IF stock.id=p_pool_id AND (stock.category<>'munition' OR stock.removed_at IS NOT NULL OR stock.anzahl IS NULL) THEN
      RAISE EXCEPTION 'Pool-Munition nicht verfügbar';
    END IF;
    delta := CASE WHEN stock.id=target.munition_pool_id THEN coalesce(target.munition_anzahl,0) ELSE 0 END
           - CASE WHEN stock.id=p_pool_id THEN p_quantity ELSE 0 END;
    IF stock.anzahl IS NULL OR stock.anzahl+delta<0 THEN RAISE EXCEPTION 'Nicht genügend Munition im Pool'; END IF;
    UPDATE pool_einsatzmittel SET anzahl=anzahl+delta WHERE id=stock.id;
  END LOOP;
  IF p_pool_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pool_einsatzmittel WHERE id=p_pool_id) THEN
    RAISE EXCEPTION 'Pool-Munition nicht gefunden';
  END IF;
  UPDATE einsatz_training_sessions SET munition_pool_id=p_pool_id, munition_anzahl=p_quantity,
    munition_marke=p_marke,munition_kaliber=p_kaliber,munition_art=p_art,
    munition_recorded_at=now(),munition_recorded_by=auth.uid() WHERE id=p_session_id;
END $$;
REVOKE ALL ON FUNCTION public.remove_training_attendance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_training_attendance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_training_munition(uuid,uuid,integer,uuid,integer,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_training_munition(uuid,uuid,integer,uuid,integer,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_cart_order(),public.guard_training_session_delete(),public.protect_profile_fields() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.audit_critical_change() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.save_portal_profile(p_user_id uuid,p_patch jsonb,p_einsatz_roles text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.profiles%ROWTYPE;
BEGIN
  IF NOT (has_role('admin') OR has_role('genehmiger') OR has_role('approver') OR has_role('sachbearbeiter')) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  IF p_patch - ARRAY['name','username','dienstnummer','roles','gender','organisation','dienstgrad','active','force_username_set'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Ungültige Profilfelder';
  END IF;
  SELECT * INTO target FROM profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Benutzer nicht gefunden'; END IF;
  SELECT * INTO target FROM jsonb_populate_record(target,p_patch);
  UPDATE profiles SET name=target.name,username=target.username,dienstnummer=target.dienstnummer,roles=target.roles,
    gender=target.gender,organisation=target.organisation,dienstgrad=target.dienstgrad,
    active=target.active,force_username_set=target.force_username_set WHERE id=p_user_id;
  IF p_einsatz_roles IS NOT NULL THEN
    IF NOT has_role('admin') OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Keine Berechtigung zur Bereichsrechteänderung'; END IF;
    IF NOT p_einsatz_roles <@ ARRAY['user','sachbearbeiter','admin'] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
    DELETE FROM portal_area_roles WHERE user_id=p_user_id AND area='einsatz_mt';
    IF cardinality(p_einsatz_roles)>0 THEN
      INSERT INTO portal_area_roles(user_id,area,roles) VALUES(p_user_id,'einsatz_mt',p_einsatz_roles);
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_portal_profile(uuid,jsonb,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_portal_profile(uuid,jsonb,text[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.create_support_request(p_subject text,p_kind text,p_topic text,p_body text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE ticket_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND active) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF p_subject IS NULL OR btrim(p_subject)='' OR p_body IS NULL OR btrim(p_body)='' THEN RAISE EXCEPTION 'Betreff und Nachricht fehlen'; END IF;
  INSERT INTO support_tickets(user_id,subject,kind,topic) VALUES(auth.uid(),p_subject,p_kind,p_topic) RETURNING id INTO ticket_id;
  INSERT INTO support_messages(ticket_id,author_id,body,from_admin) VALUES(ticket_id,auth.uid(),p_body,false);
  RETURN ticket_id;
END $$;
REVOKE ALL ON FUNCTION public.create_support_request(text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_support_request(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_stock_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.stock_orders%ROWTYPE; tailoring boolean;
BEGIN
  IF NOT (has_role('admin') OR has_role('sachbearbeiter')) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO target FROM stock_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lagerbestellung nicht gefunden'; END IF;
  IF target.status='received' THEN RETURN; END IF;
  IF target.status<>'approved' THEN RAISE EXCEPTION 'Lagerbestellung ist nicht genehmigt'; END IF;
  SELECT needs_tailoring INTO tailoring FROM products WHERE id=target.product_id;
  IF NOT coalesce(tailoring,false) THEN PERFORM adjust_inventory(target.product_id,target.size,target.quantity); END IF;
  UPDATE stock_orders SET status='received',received_at=now(),updated_at=now() WHERE id=target.id;
END $$;
REVOKE ALL ON FUNCTION public.receive_stock_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_stock_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.book_order_inventory(p_order_id uuid,p_expected_updated_at timestamptz,p_action text,p_quantity integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.orders%ROWTYPE; tailoring boolean; delta integer:=0; available integer; stock integer;
  next_status text; job_id uuid;
BEGIN
  IF NOT (has_role('admin') OR has_role('sachbearbeiter')) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO target FROM orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bestellung nicht gefunden'; END IF;
  IF target.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Bestellung wurde geändert. Bitte neu laden.'; END IF;
  SELECT needs_tailoring INTO tailoring FROM products WHERE id=target.product_id;
  IF p_action='issue' THEN
    IF target.status NOT IN ('ready_for_issue','partially_issued') THEN RAISE EXCEPTION 'Bestellung ist nicht ausgabebereit'; END IF;
    available:=coalesce(target.quantity_received,target.quantity)-coalesce(target.quantity_issued,0);
    IF p_quantity IS NULL OR p_quantity<1 OR p_quantity>available THEN RAISE EXCEPTION 'Ungültige Ausgabemenge'; END IF;
    target.quantity_issued:=coalesce(target.quantity_issued,0)+p_quantity;
    target.status:=CASE WHEN p_quantity=available THEN 'issued' ELSE 'partially_issued' END;
    IF NOT coalesce(tailoring,false) THEN delta:=-p_quantity; END IF;
  ELSIF p_action='receive' THEN
    IF target.status<>'ordered_supplier' OR p_quantity IS NULL OR p_quantity<0 THEN RAISE EXCEPTION 'Ungültiger Wareneingang'; END IF;
    target.quantity_received:=p_quantity;
    target.status:=CASE WHEN tailoring THEN 'at_tailor' ELSE 'ready_for_issue' END;
    IF tailoring THEN
      PERFORM 1 FROM quarters WHERE id=target.quarter_id FOR UPDATE;
      SELECT id INTO job_id FROM tailor_jobs WHERE quarter_id=target.quarter_id AND status='open' LIMIT 1;
      IF job_id IS NULL THEN INSERT INTO tailor_jobs(quarter_id,status) VALUES(target.quarter_id,'open') RETURNING id INTO job_id; END IF;
      target.tailor_job_id:=job_id;
    ELSE delta:=p_quantity;
    END IF;
  ELSIF p_action='step_back' THEN
    next_status:=CASE target.status
      WHEN 'ordered_supplier' THEN 'approved'
      WHEN 'at_tailor' THEN 'ordered_supplier'
      WHEN 'ready_for_issue' THEN CASE WHEN tailoring THEN 'at_tailor' ELSE 'ordered_supplier' END
      WHEN 'partially_issued' THEN 'ready_for_issue'
      WHEN 'issued' THEN 'ready_for_issue'
      WHEN 'cancelled' THEN 'approved' END;
    IF next_status IS NULL THEN RAISE EXCEPTION 'Kein vorheriger Status'; END IF;
    IF target.status IN ('issued','partially_issued') THEN
      IF NOT coalesce(tailoring,false) THEN delta:=coalesce(target.quantity_issued,0); END IF;
      target.quantity_issued:=NULL;
    ELSIF target.status='ready_for_issue' AND NOT coalesce(tailoring,false) THEN
      delta:=-coalesce(target.quantity_received,0);
      target.quantity_received:=NULL;
    ELSIF target.status='ordered_supplier' THEN target.quantity_received:=NULL;
    END IF;
    IF target.status='cancelled' THEN target.cancel_reason:=NULL; END IF;
    target.status:=next_status;
  ELSE RAISE EXCEPTION 'Unbekannte Buchung'; END IF;
  IF delta<0 THEN
    SELECT quantity INTO stock FROM inventory WHERE product_id=target.product_id AND size=target.size FOR UPDATE;
    IF NOT FOUND OR stock < -delta THEN RAISE EXCEPTION 'Nicht genügend freier Lagerbestand'; END IF;
  END IF;
  IF delta<>0 THEN PERFORM adjust_inventory(target.product_id,target.size,delta); END IF;
  UPDATE orders SET status=target.status,quantity_received=target.quantity_received,quantity_issued=target.quantity_issued,
    tailor_job_id=target.tailor_job_id,cancel_reason=target.cancel_reason,updated_at=clock_timestamp() WHERE id=target.id;
END $$;
REVOKE ALL ON FUNCTION public.book_order_inventory(uuid,timestamptz,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.book_order_inventory(uuid,timestamptz,text,integer) TO authenticated;

-- Restrict FK parent deletion as well: child inserts racing a deletion must not be cascaded away.
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT conrelid::regclass AS tab,conname,pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE confrelid='public.einsatz_training_sessions'::regclass AND contype='f' AND confdeltype='c'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',fk.tab,fk.conname);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',fk.tab,fk.conname,replace(fk.def,'ON DELETE CASCADE','ON DELETE RESTRICT'));
  END LOOP;
END $$;
