DROP POLICY IF EXISTS "Baustellen lesen" ON public.zentrale_baustellen;
CREATE POLICY "Baustellen lesen" ON public.zentrale_baustellen FOR SELECT TO authenticated
 USING ((public.has_portal_area_access('zentrale') OR public.has_portal_area_access('aussendienst')) AND (NOT restricted OR public.can_manage_zentrale()));
