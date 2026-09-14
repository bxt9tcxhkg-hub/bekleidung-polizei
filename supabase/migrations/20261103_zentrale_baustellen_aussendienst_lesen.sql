-- Baustellen sind bisher nur für die Zentrale lesbar, obwohl Außendienst
-- (Streife) sie bereits melden darf (siehe saveBaustelleReport in
-- AussendienstShell.tsx) und ihre Karte/Einsatzansicht sie jetzt ebenfalls
-- braucht, um eine Baustelle in der Nähe eines Einsatzorts anzuzeigen -
-- ohne Lesezugriff könnte Außendienst nicht einmal die eigene Meldung
-- wiedersehen. Bewusst weiterhin ohne SECURITY DEFINER-RPC (Projektkonvention).
DROP POLICY IF EXISTS "Baustellen lesen" ON public.zentrale_baustellen;
CREATE POLICY "Baustellen lesen" ON public.zentrale_baustellen FOR SELECT TO authenticated
 USING ((public.has_portal_area_access('zentrale') OR public.has_portal_area_access('aussendienst')) AND (NOT restricted OR public.can_manage_zentrale()));
