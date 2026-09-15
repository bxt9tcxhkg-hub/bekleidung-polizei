-- Rollenabdeckung der RLS-Policies reparieren:
-- Sachbearbeiter konnte nichts verwalten (nur admin), Rolle 'genehmiger' fehlte
-- überall (nur 'approver'), Benutzer konnten ihr eigenes Profil nicht ändern.

-- ── products ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin verwaltet Produkte" ON public.products;
CREATE POLICY "Sachbearbeiter verwaltet Produkte" ON public.products
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'))
  WITH CHECK (has_role('admin') OR has_role('sachbearbeiter'));

-- ── quarters ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin verwaltet Quartale" ON public.quarters;
CREATE POLICY "Sachbearbeiter verwaltet Quartale" ON public.quarters
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'))
  WITH CHECK (has_role('admin') OR has_role('sachbearbeiter'));

-- ── inventory ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin verwaltet Lager" ON public.inventory;
DROP POLICY IF EXISTS "Admin sieht Lager" ON public.inventory;
CREATE POLICY "Angemeldete sehen Lager" ON public.inventory
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sachbearbeiter verwaltet Lager" ON public.inventory
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'))
  WITH CHECK (has_role('admin') OR has_role('sachbearbeiter'));

-- ── tailor_jobs ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin verwaltet Näherin-Aufträge" ON public.tailor_jobs;
DROP POLICY IF EXISTS "Admin sieht Näherin-Aufträge" ON public.tailor_jobs;
CREATE POLICY "Sachbearbeiter verwaltet Schneider-Aufträge" ON public.tailor_jobs
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'))
  WITH CHECK (has_role('admin') OR has_role('sachbearbeiter'));

-- ── orders ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin und Genehmiger sehen alle Bestellungen" ON public.orders;
CREATE POLICY "Staff sieht alle Bestellungen" ON public.orders
  FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver'));
DROP POLICY IF EXISTS "Admin bearbeitet alle Bestellungen" ON public.orders;
CREATE POLICY "Sachbearbeiter bearbeitet alle Bestellungen" ON public.orders
  FOR UPDATE TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'));
DROP POLICY IF EXISTS "Genehmiger bearbeitet pending_approval" ON public.orders;
CREATE POLICY "Genehmiger bearbeitet pending_approval" ON public.orders
  FOR UPDATE TO authenticated
  USING ((has_role('genehmiger') OR has_role('approver')) AND status = 'pending_approval');

-- ── profiles ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin sieht alle Profile" ON public.profiles;
CREATE POLICY "Staff sieht alle Profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver'));
DROP POLICY IF EXISTS "Admin kann Profile bearbeiten" ON public.profiles;
CREATE POLICY "Sachbearbeiter bearbeitet Profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'));
CREATE POLICY "Benutzer bearbeitet eigenes Profil" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Schutz: normale Benutzer dürfen ihre eigenen sensiblen Felder nicht ändern
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (has_role('admin') OR has_role('sachbearbeiter'))
     AND (NEW.roles IS DISTINCT FROM OLD.roles
          OR NEW.active IS DISTINCT FROM OLD.active
          OR NEW.organisation IS DISTINCT FROM OLD.organisation
          OR NEW.username IS DISTINCT FROM OLD.username) THEN
    RAISE EXCEPTION 'Keine Berechtigung, diese Profilfelder zu ändern';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile_fields ON public.profiles;
CREATE TRIGGER protect_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- ── shoe_refunds ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Genehmiger erstellt Erstattungen" ON public.shoe_refunds;
DROP POLICY IF EXISTS "Genehmiger sieht alle Erstattungen" ON public.shoe_refunds;
CREATE POLICY "Genehmiger erstellt Erstattungen" ON public.shoe_refunds
  FOR INSERT TO authenticated
  WITH CHECK (has_role('admin') OR has_role('genehmiger') OR has_role('approver'));
CREATE POLICY "Genehmiger sieht alle Erstattungen" ON public.shoe_refunds
  FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('genehmiger') OR has_role('approver'));
CREATE POLICY "Genehmiger bearbeitet Erstattungen" ON public.shoe_refunds
  FOR UPDATE TO authenticated
  USING (has_role('admin') OR has_role('genehmiger') OR has_role('approver'));

-- ── audit_log ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin und Genehmiger sehen Protokoll" ON public.audit_log;
CREATE POLICY "Sachbearbeiter sieht Protokoll" ON public.audit_log
  FOR SELECT TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter'));
