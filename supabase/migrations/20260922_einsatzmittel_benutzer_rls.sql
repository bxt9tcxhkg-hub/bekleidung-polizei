-- Benutzer (einsatz_mt user, nicht Sachbearbeiter/Admin):
--   personal_einsatzmittel: SELECT nur eigene Zeilen (officer_id = auth.uid())
--   pool_einsatzmittel:     SELECT ohne Kategorie munition
--   Lagerbestand:           keine eigene Tabelle — UI nur für can_manage
-- Sachbearbeiter/Admin / can_manage_einsatzmittel(): unverändert voller Zugriff.
-- Schreiben bleibt ausschließlich can_manage_einsatzmittel().
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

DROP POLICY IF EXISTS "Einsatzmittel lesen" ON public.personal_einsatzmittel;
CREATE POLICY "Einsatzmittel lesen" ON public.personal_einsatzmittel
  FOR SELECT TO authenticated
  USING (
    public.can_manage_einsatzmittel()
    OR (
      public.has_portal_area_access('einsatz_mt')
      AND officer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Pool-Einsatzmittel lesen" ON public.pool_einsatzmittel;
CREATE POLICY "Pool-Einsatzmittel lesen" ON public.pool_einsatzmittel
  FOR SELECT TO authenticated
  USING (
    public.can_manage_einsatzmittel()
    OR (
      public.has_portal_area_access('einsatz_mt')
      AND category IS DISTINCT FROM 'munition'
    )
  );
