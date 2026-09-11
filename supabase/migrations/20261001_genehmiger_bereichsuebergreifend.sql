-- Genehmiger wird bereichsübergreifende Aufsicht: wie Admin schon heute, soll
-- die globale Rolle "genehmiger" (Synonym "approver") in jedem Bereich (Zentrale,
-- Fuhrpark, Einsatzmittel & Training, Schulungen) dieselben Verwaltungs- und
-- Leserechte wie ein Bereichs-Sachbearbeiter bekommen, unabhängig von einer
-- eigenen portal_area_roles-Zuweisung. Bekleidung selbst ist nicht betroffen
-- (nutzt schon has_role() direkt auf profiles.roles, Genehmiger hat dort
-- bereits vollen Zugriff).

CREATE OR REPLACE FUNCTION public.has_portal_area_access(p_area text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role('admin')
      OR public.has_role('genehmiger')
      OR public.has_role('approver')
      OR EXISTS (
            SELECT 1
              FROM public.profiles p
              JOIN public.portal_area_roles r ON r.user_id = p.id
             WHERE p.id = auth.uid()
               AND p.active IS TRUE
               AND r.area = p_area
               AND cardinality(r.roles) >= 1
          );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_zentrale()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT public.has_role('admin') OR public.has_role('genehmiger') OR public.has_role('approver') OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.portal_area_roles r ON r.user_id=p.id
  WHERE p.id=(SELECT auth.uid()) AND p.active AND r.area='zentrale'
    AND r.roles && ARRAY['sachbearbeiter','admin']::text[]
 );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_fuhrpark()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT public.has_role('admin') OR public.has_role('genehmiger') OR public.has_role('approver') OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.portal_area_roles r ON r.user_id=p.id
  WHERE p.id=(SELECT auth.uid()) AND p.active AND r.area='fuhrpark'
    AND r.roles && ARRAY['sachbearbeiter','admin']::text[]
 );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_schulungen()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT public.has_role('admin') OR public.has_role('genehmiger') OR public.has_role('approver') OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.portal_area_roles r ON r.user_id=p.id
  WHERE p.id=(SELECT auth.uid()) AND p.active AND r.area='schulungen'
    AND r.roles && ARRAY['sachbearbeiter','admin']::text[]
 );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_einsatzmittel()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role('admin')
      OR public.has_role('genehmiger')
      OR public.has_role('approver')
      OR public.has_portal_area_role('einsatz_mt', 'sachbearbeiter')
      OR public.has_portal_area_role('einsatz_mt', 'admin');
$function$;
