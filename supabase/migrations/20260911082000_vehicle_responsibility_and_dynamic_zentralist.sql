ALTER TABLE public.fleet_vehicles
 ADD COLUMN responsible_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX fleet_vehicles_responsible_user_id_idx
 ON public.fleet_vehicles(responsible_user_id);

UPDATE public.portal_area_roles
SET roles = CASE
  WHEN cardinality(array_remove(roles, 'zentralist')) = 0 THEN ARRAY['user']::text[]
  ELSE array_remove(roles, 'zentralist')
END,
updated_at = now()
WHERE area = 'zentrale' AND 'zentralist' = ANY(roles);

ALTER TABLE public.portal_area_roles DROP CONSTRAINT IF EXISTS portal_area_roles_roles_valid;
ALTER TABLE public.portal_area_roles ADD CONSTRAINT portal_area_roles_roles_valid CHECK (
 (area='bekleidung' AND roles <@ ARRAY['user','sachbearbeiter','genehmiger','admin']::text[])
 OR (area IN ('einsatz_mt','schulungen','fuhrpark','zentrale') AND roles <@ ARRAY['user','sachbearbeiter','admin']::text[])
);

CREATE OR REPLACE FUNCTION public.can_manage_zentrale() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.has_role('admin') OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.portal_area_roles r ON r.user_id=p.id
  WHERE p.id=(SELECT auth.uid()) AND p.active AND r.area='zentrale'
    AND r.roles && ARRAY['sachbearbeiter','admin']::text[]
 );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_support_topic(p_topic text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role('admin')
 OR (p_topic='bekleidung' AND (public.has_portal_area_role('bekleidung','sachbearbeiter') OR public.has_portal_area_role('bekleidung','admin')))
 OR (p_topic='einsatz_mt' AND (public.has_portal_area_role('einsatz_mt','sachbearbeiter') OR public.has_portal_area_role('einsatz_mt','admin')))
 OR (p_topic='schulungen' AND (public.has_portal_area_role('schulungen','sachbearbeiter') OR public.has_portal_area_role('schulungen','admin')))
 OR (p_topic='fuhrpark' AND (public.has_portal_area_role('fuhrpark','sachbearbeiter') OR public.has_portal_area_role('fuhrpark','admin')))
 OR (p_topic='zentrale' AND (public.has_portal_area_role('zentrale','sachbearbeiter') OR public.has_portal_area_role('zentrale','admin')));
$$;
