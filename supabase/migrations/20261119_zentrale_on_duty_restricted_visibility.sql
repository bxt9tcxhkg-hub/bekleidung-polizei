-- Reaktion auf ein Review-Finding (P2): die SELECT-Policy der sechs
-- Kategorietabellen zeigte "vertrauliche" (restricted) Zeilen bisher nur
-- can_manage_zentrale(). Da 20261117_zentrale_on_duty_operative_write_access.sql
-- diensthabenden Zentralisten jetzt erlaubt, restricted=true zu setzen (das
-- Formular zeigt die Checkbox ungefiltert an), verschwand ein gerade selbst
-- angelegter vertraulicher Eintrag für sie sofort wieder aus der Liste und
-- konnte während der Schicht nicht mehr korrigiert werden. Sichtbarkeit von
-- restricted-Zeilen folgt jetzt demselben can_manage_zentrale() OR
-- is_zentralist_on_duty() wie das Schreibrecht selbst.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['zentrale_av_bv','zentrale_fahndungen','zentrale_schluessel','zentrale_kontakte','zentrale_alarmierung','zentrale_unterlagen'] LOOP
    EXECUTE format('DROP POLICY "%1$s lesen" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s lesen" ON public.%1$s FOR SELECT USING (public.has_portal_area_access(''zentrale'') AND (NOT restricted OR public.can_manage_zentrale() OR public.is_zentralist_on_duty()))', t);
    -- (Kein "TO authenticated" - wie im Original: REVOKE ALL FROM PUBLIC,anon
    -- auf Tabellenebene macht die Policy für anon ohnehin wirkungslos.)
  END LOOP;
END $$;
