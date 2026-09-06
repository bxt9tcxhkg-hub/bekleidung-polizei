-- Portal-Benutzerverwaltung: Genehmiger (Bekleidung) darf Bereichsrechte
-- lesen, damit die Portal-UI Benutzer inkl. Bekleidungs-Dual-Write
-- darstellen kann. Schreiben von portal_area_roles bleibt Admin-only
-- (einsatz_mt nicht an Genehmiger öffnen). Bekleidung-Sync weiter über
-- Trigger sync_portal_bekleidung_from_profile (profiles.roles).
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

DROP POLICY IF EXISTS "Bereichsrechte lesen" ON public.portal_area_roles;
CREATE POLICY "Bereichsrechte lesen" ON public.portal_area_roles
  FOR SELECT TO authenticated
  USING (
    has_role('admin')
    OR has_role('genehmiger')
    OR has_role('approver')
    OR user_id = auth.uid()
  );

-- Schreiben unverändert Admin-only (einsatz_mt bleibt Admin-Sache).
DROP POLICY IF EXISTS "Admin schreibt Bereichsrechte" ON public.portal_area_roles;
CREATE POLICY "Admin schreibt Bereichsrechte" ON public.portal_area_roles
  FOR ALL TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));
