
ALTER TABLE public.portal_area_roles DROP CONSTRAINT IF EXISTS portal_area_roles_area_check;
ALTER TABLE public.portal_area_roles ADD CONSTRAINT portal_area_roles_area_check CHECK (area IN ('bekleidung','einsatz_mt','schulungen','fuhrpark'));
ALTER TABLE public.portal_area_roles DROP CONSTRAINT IF EXISTS portal_area_roles_roles_valid;
ALTER TABLE public.portal_area_roles ADD CONSTRAINT portal_area_roles_roles_valid CHECK (
 (area='bekleidung' AND roles <@ ARRAY['user','sachbearbeiter','genehmiger','admin']::text[])
 OR (area IN ('einsatz_mt','schulungen','fuhrpark') AND roles <@ ARRAY['user','sachbearbeiter','admin']::text[])
);

CREATE OR REPLACE FUNCTION public.can_manage_fuhrpark() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.has_role('admin') OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.portal_area_roles r ON r.user_id=p.id
  WHERE p.id=(SELECT auth.uid()) AND p.active AND r.area='fuhrpark'
    AND r.roles && ARRAY['sachbearbeiter','admin']::text[]
 );
$$;
REVOKE ALL ON FUNCTION public.can_manage_fuhrpark() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_fuhrpark() TO authenticated;

CREATE TABLE public.fleet_vehicles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
 kind text NOT NULL CHECK (kind IN ('Dienstfahrzeug','Motorrad')),
 make text CHECK (make IS NULL OR length(make)<=60),
 model text CHECK (model IS NULL OR length(model)<=60),
 call_sign text CHECK (call_sign IS NULL OR length(call_sign)<=80),
 license_plate text CHECK (license_plate IS NULL OR length(license_plate)<=20),
 notes text CHECK (notes IS NULL OR length(notes)<=1000),
 active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fleet_vehicles_call_sign_unique ON public.fleet_vehicles(lower(trim(call_sign))) WHERE call_sign IS NOT NULL;
CREATE UNIQUE INDEX fleet_vehicles_license_plate_unique ON public.fleet_vehicles(lower(trim(license_plate))) WHERE license_plate IS NOT NULL;
CREATE INDEX fleet_vehicles_active_kind_name ON public.fleet_vehicles(active,kind,name);
CREATE TRIGGER fleet_vehicles_updated_at BEFORE UPDATE ON public.fleet_vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_vehicles FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.fleet_vehicles TO authenticated;
CREATE POLICY "Fuhrpark Fahrzeuge lesen" ON public.fleet_vehicles FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Fuhrpark Fahrzeuge anlegen" ON public.fleet_vehicles FOR INSERT TO authenticated
 WITH CHECK (public.can_manage_fuhrpark() AND (created_by IS NULL OR created_by=(SELECT auth.uid())));
CREATE POLICY "Fuhrpark Fahrzeuge ändern" ON public.fleet_vehicles FOR UPDATE TO authenticated
 USING (public.can_manage_fuhrpark()) WITH CHECK (public.can_manage_fuhrpark());
CREATE POLICY "Fuhrpark Fahrzeuge löschen" ON public.fleet_vehicles FOR DELETE TO authenticated
 USING (public.can_manage_fuhrpark());

INSERT INTO public.portal_area_roles(user_id,area,roles)
SELECT id,'fuhrpark',ARRAY['user']::text[] FROM public.profiles
WHERE active AND NOT (roles @> ARRAY['admin']::text[])
ON CONFLICT(user_id,area) DO NOTHING;

INSERT INTO public.fleet_vehicles(name,kind,make,model,call_sign)
VALUES
 ('Mercedes-Benz Vito','Dienstfahrzeug','Mercedes-Benz','Vito','Dornbirn Peter 1'),
 ('Volkswagen Tiguan','Dienstfahrzeug','Volkswagen','Tiguan','Dornbirn Peter 2'),
 ('Mazda CX-5','Dienstfahrzeug','Mazda','CX-5','Dornbirn Peter 30'),
 ('Motorrad 1','Motorrad',NULL,NULL,NULL),
 ('Motorrad 2','Motorrad',NULL,NULL,NULL);

CREATE OR REPLACE FUNCTION public.save_portal_profile_v3(
 p_user_id uuid,p_patch jsonb,p_einsatz_roles text[],p_schulungen_roles text[],p_fuhrpark_roles text[]
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.profiles%ROWTYPE;
BEGIN
 IF NOT public.has_role('admin') THEN RAISE EXCEPTION 'Nur Admins dürfen Benutzer- und Bereichsrechte gemeinsam bearbeiten'; END IF;
 IF p_patch-ARRAY['name','username','dienstnummer','roles','gender','organisation','dienstgrad','active','force_username_set'] <> '{}'::jsonb THEN RAISE EXCEPTION 'Ungültige Profilfelder'; END IF;
 SELECT * INTO target FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Benutzer nicht gefunden'; END IF;
 SELECT * INTO target FROM jsonb_populate_record(target,p_patch);
 UPDATE public.profiles SET name=target.name,username=target.username,dienstnummer=target.dienstnummer,roles=target.roles,
  gender=target.gender,organisation=target.organisation,dienstgrad=target.dienstgrad,active=target.active,
  force_username_set=target.force_username_set WHERE id=p_user_id;
 IF (p_einsatz_roles IS NOT NULL OR p_schulungen_roles IS NOT NULL OR p_fuhrpark_roles IS NOT NULL)
   AND p_user_id=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Eigene Bereichsrechte können nicht geändert werden'; END IF;
 IF p_einsatz_roles IS NOT NULL THEN
  IF NOT p_einsatz_roles <@ ARRAY['user','sachbearbeiter','admin']::text[] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
  DELETE FROM public.portal_area_roles WHERE user_id=p_user_id AND area='einsatz_mt';
  IF cardinality(p_einsatz_roles)>0 THEN INSERT INTO public.portal_area_roles VALUES(p_user_id,'einsatz_mt',p_einsatz_roles,now(),now()); END IF;
 END IF;
 IF p_schulungen_roles IS NOT NULL THEN
  IF NOT p_schulungen_roles <@ ARRAY['user','sachbearbeiter','admin']::text[] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
  DELETE FROM public.portal_area_roles WHERE user_id=p_user_id AND area='schulungen';
  IF cardinality(p_schulungen_roles)>0 THEN INSERT INTO public.portal_area_roles VALUES(p_user_id,'schulungen',p_schulungen_roles,now(),now()); END IF;
 END IF;
 IF p_fuhrpark_roles IS NOT NULL THEN
  IF NOT p_fuhrpark_roles <@ ARRAY['user','sachbearbeiter','admin']::text[] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
  DELETE FROM public.portal_area_roles WHERE user_id=p_user_id AND area='fuhrpark';
  IF cardinality(p_fuhrpark_roles)>0 THEN INSERT INTO public.portal_area_roles VALUES(p_user_id,'fuhrpark',p_fuhrpark_roles,now(),now()); END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_portal_profile_v3(uuid,jsonb,text[],text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_portal_profile_v3(uuid,jsonb,text[],text[],text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_support_topic(p_topic text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role('admin')
 OR (p_topic='bekleidung' AND (public.has_portal_area_role('bekleidung','sachbearbeiter') OR public.has_portal_area_role('bekleidung','admin')))
 OR (p_topic='einsatz_mt' AND (public.has_portal_area_role('einsatz_mt','sachbearbeiter') OR public.has_portal_area_role('einsatz_mt','admin')))
 OR (p_topic='schulungen' AND (public.has_portal_area_role('schulungen','sachbearbeiter') OR public.has_portal_area_role('schulungen','admin')))
 OR (p_topic='fuhrpark' AND (public.has_portal_area_role('fuhrpark','sachbearbeiter') OR public.has_portal_area_role('fuhrpark','admin')));
$$;
REVOKE ALL ON FUNCTION public.can_manage_support_topic(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_support_topic(text) TO authenticated;
