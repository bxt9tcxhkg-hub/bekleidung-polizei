DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['zentrale_av_bv','zentrale_fahndungen','zentrale_schluessel','zentrale_kontakte','zentrale_alarmierung','zentrale_unterlagen'] LOOP
    EXECUTE format('DROP POLICY "%1$s lesen" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s lesen" ON public.%1$s FOR SELECT USING (public.has_portal_area_access(''zentrale'') AND (NOT restricted OR public.can_manage_zentrale() OR public.is_zentralist_on_duty()))', t);
  END LOOP;
END $$;
