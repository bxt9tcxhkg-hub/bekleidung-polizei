-- Fix Warenkorb für Artikel ohne Größenwahl (size_mode none / universal).
-- Bug: guard_cart_order / submit_cart / update_editable_order verlangten size = ANY(sizes).
-- Bei size_mode=none ist sizes=[] → Insert schlägt fehl (Signalpfeife, Etui, Aufschubdistinktionen).

CREATE OR REPLACE FUNCTION public.product_size_is_valid(
  p_size text,
  p_sizes text[],
  p_size_mode text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE coalesce(p_size_mode, 'sizes')
    WHEN 'none' THEN coalesce(btrim(p_size), '') = ''
    WHEN 'universal' THEN
      coalesce(p_size, '') = 'Uni'
      OR coalesce(p_size = ANY (p_sizes), false)
    ELSE
      coalesce(p_size = ANY (p_sizes), false)
  END;
$$;

COMMENT ON FUNCTION public.product_size_is_valid(text, text[], text) IS
  'Warenkorb: gültige Größe je size_mode (sizes / universal / none).';


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
  article public.products%ROWTYPE;
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

  SELECT * INTO article FROM public.products WHERE id = target.product_id;
  IF NOT FOUND OR NOT public.product_size_is_valid(p_size, article.sizes, article.size_mode) THEN
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
$function$;

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
    IF NOT FOUND OR NEW.quantity IS NULL OR NEW.quantity < 1 OR NOT public.product_size_is_valid(NEW.size, article.sizes, article.size_mode) THEN
      RAISE EXCEPTION 'Artikel, Größe oder Menge ungültig';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND active AND organisation = article.organisation) THEN
      RAISE EXCEPTION 'Artikel gehört nicht zur Organisation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.quarters WHERE id = NEW.quarter_id AND status = 'active') THEN
      RAISE EXCEPTION 'Bestellquartal ist nicht aktiv';
    END IF;
    NEW.unit_price := article.price;
    IF coalesce(article.size_mode, 'sizes') = 'none' THEN
      NEW.size := '';
    ELSIF article.size_mode = 'universal' AND coalesce(btrim(NEW.size), '') = '' THEN
      NEW.size := 'Uni';
    END IF;
  END IF;
  RETURN NEW;
END $$;

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
       OR NOT public.product_size_is_valid(o.size, p.sizes, p.size_mode) OR p.organisation IS DISTINCT FROM u.organisation)
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

