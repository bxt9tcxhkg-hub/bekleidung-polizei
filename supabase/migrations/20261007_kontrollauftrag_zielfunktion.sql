-- Kontrollaufträge: der Genehmiger (Kommandant) legt fest, ob ein Auftrag den
-- JD, den VD oder beide betrifft. Nur der Genehmiger darf Kontrollaufträge
-- anlegen, ändern oder löschen (schärfer als can_manage_zentrale(), das auch
-- Zentralisten/Sachbearbeiter umfasst). Alle anderen Kategorien in
-- zentrale_entries bleiben unverändert bei can_manage_zentrale().

ALTER TABLE public.zentrale_entries ADD COLUMN target_function text
  CHECK (target_function IS NULL OR target_function IN ('jd','vd','beide'));
COMMENT ON COLUMN public.zentrale_entries.target_function IS
  'Nur für category=kontrollauftrag relevant: welche Funktion(en) der Auftrag betrifft.';

DROP POLICY "Zentrale Einträge anlegen" ON public.zentrale_entries;
CREATE POLICY "Zentrale Einträge anlegen" ON public.zentrale_entries FOR INSERT TO authenticated
 WITH CHECK (
   (created_by IS NULL OR created_by=(SELECT auth.uid()))
   AND (
     (category='kontrollauftrag' AND public.is_genehmiger())
     OR (category<>'kontrollauftrag' AND public.can_manage_zentrale())
   )
 );

DROP POLICY "Zentrale Einträge ändern" ON public.zentrale_entries;
CREATE POLICY "Zentrale Einträge ändern" ON public.zentrale_entries FOR UPDATE TO authenticated
 USING ((category='kontrollauftrag' AND public.is_genehmiger()) OR (category<>'kontrollauftrag' AND public.can_manage_zentrale()))
 WITH CHECK ((category='kontrollauftrag' AND public.is_genehmiger()) OR (category<>'kontrollauftrag' AND public.can_manage_zentrale()));

DROP POLICY "Zentrale Einträge löschen" ON public.zentrale_entries;
CREATE POLICY "Zentrale Einträge löschen" ON public.zentrale_entries FOR DELETE TO authenticated
 USING ((category='kontrollauftrag' AND public.is_genehmiger()) OR (category<>'kontrollauftrag' AND public.can_manage_zentrale()));
