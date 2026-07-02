-- Security-Hardening (bereits auf Produktion angewendet am 2026-07-02)
-- Dokumentiert die per Supabase MCP angewendete Migration "security_hardening_rls_views_functions".

-- 1. shoe_refund_caps: RLS aktivieren (lesen: alle Angemeldeten, schreiben: Genehmiger/Admin)
ALTER TABLE public.shoe_refund_caps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Angemeldete lesen Caps" ON public.shoe_refund_caps
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Genehmiger verwalten Caps" ON public.shoe_refund_caps
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('genehmiger') OR has_role('approver'))
  WITH CHECK (has_role('admin') OR has_role('genehmiger') OR has_role('approver'));

-- 2. grundausstattung: RLS aktivieren (lesen: alle Angemeldeten, schreiben: Sachbearbeiter/Admin)
ALTER TABLE public.grundausstattung ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Angemeldete lesen Grundausstattung" ON public.grundausstattung
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sachbearbeiter verwalten Grundausstattung" ON public.grundausstattung
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'))
  WITH CHECK (has_role('admin') OR has_role('sachbearbeiter'));

-- 3. stock_orders: Allow-All-Policies durch Rollenprüfung ersetzen
DROP POLICY IF EXISTS stock_orders_insert ON public.stock_orders;
DROP POLICY IF EXISTS stock_orders_update ON public.stock_orders;
DROP POLICY IF EXISTS stock_orders_read ON public.stock_orders;
CREATE POLICY stock_orders_read ON public.stock_orders
  FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver'));
CREATE POLICY stock_orders_insert ON public.stock_orders
  FOR INSERT TO authenticated
  WITH CHECK ((has_role('admin') OR has_role('sachbearbeiter')) AND requested_by = auth.uid());
CREATE POLICY stock_orders_update ON public.stock_orders
  FOR UPDATE TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver'));

-- 4. SECURITY-DEFINER-Views auf Invoker-Rechte umstellen (RLS gilt dann für den Abfragenden)
ALTER VIEW public.orders_full SET (security_invoker = on);
ALTER VIEW public.budget_usage SET (security_invoker = on);

-- 5. Funktionen härten: search_path fixieren, Ausführung einschränken
ALTER FUNCTION public.has_role(text) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(text) FROM anon;

-- 6. EXECUTE-Grant an PUBLIC entfernen (Default-Grant von Postgres)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(text) FROM PUBLIC;
-- has_role wird in RLS-Policies ausgewertet und muss für angemeldete Benutzer ausführbar bleiben
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
