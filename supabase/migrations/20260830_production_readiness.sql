-- Production-readiness: Genehmiger-Freigabe, deliveries-RLS, aktive Konten,
-- fehlende Benutzer-/Budget-Policies. Idempotent.

-- 1. Genehmiger darf pending_approval → approved | cancelled schreiben.
--    Ohne WITH CHECK gilt USING auch für die neue Zeile; status wäre dann
--    nicht mehr pending_approval und die Freigabe scheitert.
DROP POLICY IF EXISTS "Genehmiger bearbeitet pending_approval" ON public.orders;
CREATE POLICY "Genehmiger bearbeitet pending_approval" ON public.orders
  FOR UPDATE TO authenticated
  USING ((has_role('genehmiger') OR has_role('approver')) AND status = 'pending_approval')
  WITH CHECK (
    (has_role('genehmiger') OR has_role('approver'))
    AND status IN ('approved', 'cancelled', 'pending_approval')
  );

-- 2. deliveries: RLS (Tabelle wurde im Client genutzt, Policies fehlten im Repo)
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Sachbearbeiter sieht Lieferungen" ON public.deliveries;
DROP POLICY IF EXISTS "Sachbearbeiter verwaltet Lieferungen" ON public.deliveries;
CREATE POLICY "Sachbearbeiter sieht Lieferungen" ON public.deliveries
  FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'));
CREATE POLICY "Sachbearbeiter verwaltet Lieferungen" ON public.deliveries
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'))
  WITH CHECK (has_role('admin') OR has_role('sachbearbeiter'));

-- 3. Benutzer-Policies (falls die Baseline auf einer bestehenden DB nicht lief)
DROP POLICY IF EXISTS "Benutzer sieht eigenes Profil" ON public.profiles;
CREATE POLICY "Benutzer sieht eigenes Profil" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Angemeldete sehen Produkte" ON public.products;
CREATE POLICY "Angemeldete sehen Produkte" ON public.products
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Angemeldete sehen Quartale" ON public.quarters;
CREATE POLICY "Angemeldete sehen Quartale" ON public.quarters
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Benutzer sieht eigene Bestellungen" ON public.orders;
CREATE POLICY "Benutzer sieht eigene Bestellungen" ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Benutzer erstellt Warenkorb" ON public.orders;
CREATE POLICY "Benutzer erstellt Warenkorb" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Benutzer ändert eigenen Warenkorb" ON public.orders;
CREATE POLICY "Benutzer ändert eigenen Warenkorb" ON public.orders
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Benutzer löscht eigenen Warenkorb" ON public.orders;
CREATE POLICY "Benutzer löscht eigenen Warenkorb" ON public.orders
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Angemeldete schreiben Protokoll" ON public.audit_log;
CREATE POLICY "Angemeldete schreiben Protokoll" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Benutzer liest eigenes Budget" ON public.user_budgets;
CREATE POLICY "Benutzer liest eigenes Budget" ON public.user_budgets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Genehmiger verwaltet Budgets" ON public.user_budgets;
CREATE POLICY "Genehmiger verwaltet Budgets" ON public.user_budgets
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('genehmiger') OR has_role('approver'))
  WITH CHECK (has_role('admin') OR has_role('genehmiger') OR has_role('approver'));

-- 4. Deaktivierte Konten verlieren Rollenrechte (active-Flag existiert bereits)
CREATE OR REPLACE FUNCTION public.has_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND active = true
      AND role_name = ANY (roles)
  );
$$;
REVOKE ALL ON FUNCTION public.has_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;

-- 5. Warenkorb-Einreichung nur für aktive Konten
CREATE OR REPLACE FUNCTION public.submit_cart()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  yr int := extract(year from now())::int;
  total numeric;
  used numeric;
  cart numeric;
  new_status text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND active = true) THEN
    RAISE EXCEPTION 'Konto deaktiviert';
  END IF;
  SELECT coalesce(
    (SELECT total_budget FROM user_budgets
     WHERE user_id = uid AND year = yr AND valid_from <= current_date
     ORDER BY valid_from DESC LIMIT 1), 350) INTO total;
  SELECT coalesce(sum(unit_price * quantity), 0) INTO used
    FROM orders
    WHERE user_id = uid AND status NOT IN ('pending', 'cancelled')
      AND created_at >= make_date(yr, 1, 1);
  SELECT coalesce(sum(unit_price * quantity), 0) INTO cart
    FROM orders WHERE user_id = uid AND status = 'pending';
  IF cart = 0 THEN RETURN NULL; END IF;
  new_status := CASE WHEN used + cart > total THEN 'pending_approval' ELSE 'approved' END;
  UPDATE orders SET status = new_status, updated_at = now()
    WHERE user_id = uid AND status = 'pending';
  RETURN new_status;
END $$;
REVOKE ALL ON FUNCTION public.submit_cart() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_cart() TO authenticated;
