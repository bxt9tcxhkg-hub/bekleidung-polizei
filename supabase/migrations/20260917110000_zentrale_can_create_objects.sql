-- Objekte anlegen war seit "admin_only_register_maintenance" fälschlich
-- Admin-only (analog zum selben, bereits für operational_persons behobenen
-- Bug, siehe "zentrale_can_create_persons"). Ein Einsatzort muss aber direkt
-- beim Vormerken eines Schutzfalls als Objekt im gemeinsamen Register
-- landen können, nicht erst nach Rückfrage bei der Administration.
DROP POLICY IF EXISTS "Objekte anlegen" ON public.operational_objects;
CREATE POLICY "Objekte anlegen"
ON public.operational_objects
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT public.has_portal_area_access('zentrale'))
  AND created_by = (SELECT auth.uid())
);
