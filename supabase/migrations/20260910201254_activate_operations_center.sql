ALTER TABLE public.portal_area_roles DROP CONSTRAINT IF EXISTS portal_area_roles_area_check;
ALTER TABLE public.portal_area_roles ADD CONSTRAINT portal_area_roles_area_check CHECK (area IN ('bekleidung','einsatz_mt','schulungen','fuhrpark','zentrale'));
ALTER TABLE public.portal_area_roles DROP CONSTRAINT IF EXISTS portal_area_roles_roles_valid;
ALTER TABLE public.portal_area_roles ADD CONSTRAINT portal_area_roles_roles_valid CHECK (
 (area='bekleidung' AND roles <@ ARRAY['user','sachbearbeiter','genehmiger','admin']::text[])
 OR (area IN ('einsatz_mt','schulungen','fuhrpark') AND roles <@ ARRAY['user','sachbearbeiter','admin']::text[])
 OR (area='zentrale' AND roles <@ ARRAY['user','zentralist','sachbearbeiter','admin']::text[])
);

CREATE OR REPLACE FUNCTION public.can_manage_zentrale() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.has_role('admin') OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.portal_area_roles r ON r.user_id=p.id
  WHERE p.id=(SELECT auth.uid()) AND p.active AND r.area='zentrale'
    AND r.roles && ARRAY['zentralist','sachbearbeiter','admin']::text[]
 );
$$;
REVOKE ALL ON FUNCTION public.can_manage_zentrale() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_zentrale() TO authenticated;

CREATE TABLE public.zentrale_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 category text NOT NULL CHECK (category IN ('lage','kontrollauftrag','verbot','fahndung','brief','schluessel','kontakt','alarmierung','uebergabe','unterlage')),
 title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
 description text CHECK (description IS NULL OR length(description)<=3000),
 priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','hoch','kritisch')),
 status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','in_bearbeitung','erledigt')),
 valid_from date,
 valid_until date,
 location text CHECK (location IS NULL OR length(location)<=200),
 responsible text CHECK (responsible IS NULL OR length(responsible)<=200),
 reference text CHECK (reference IS NULL OR length(reference)<=500),
 restricted boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT zentrale_entries_valid_range CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_until>=valid_from)
);
CREATE INDEX zentrale_entries_category_status ON public.zentrale_entries(category,status,updated_at DESC);
CREATE INDEX zentrale_entries_open_priority ON public.zentrale_entries(priority,updated_at DESC) WHERE status<>'erledigt';
CREATE TRIGGER zentrale_entries_updated_at BEFORE UPDATE ON public.zentrale_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.zentrale_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.zentrale_entries FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.zentrale_entries TO authenticated;
CREATE POLICY "Zentrale Einträge lesen" ON public.zentrale_entries FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale') AND (NOT restricted OR public.can_manage_zentrale()));
CREATE POLICY "Zentrale Einträge anlegen" ON public.zentrale_entries FOR INSERT TO authenticated
 WITH CHECK (public.can_manage_zentrale() AND (created_by IS NULL OR created_by=(SELECT auth.uid())));
CREATE POLICY "Zentrale Einträge ändern" ON public.zentrale_entries FOR UPDATE TO authenticated
 USING (public.can_manage_zentrale()) WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Zentrale Einträge löschen" ON public.zentrale_entries FOR DELETE TO authenticated
 USING (public.can_manage_zentrale());

INSERT INTO public.portal_area_roles(user_id,area,roles)
SELECT id,'zentrale',ARRAY['user']::text[] FROM public.profiles
WHERE active AND NOT (roles @> ARRAY['admin']::text[])
ON CONFLICT(user_id,area) DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_portal_profile_v4(
 p_user_id uuid,p_patch jsonb,p_einsatz_roles text[],p_schulungen_roles text[],p_fuhrpark_roles text[],p_zentrale_roles text[]
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
 IF (p_einsatz_roles IS NOT NULL OR p_schulungen_roles IS NOT NULL OR p_fuhrpark_roles IS NOT NULL OR p_zentrale_roles IS NOT NULL)
   AND p_user_id=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Eigene Bereichsrechte können nicht geändert werden'; END IF;
 IF p_einsatz_roles IS NOT NULL THEN
  IF NOT p_einsatz_roles <@ ARRAY['user','sachbearbeiter','admin']::text[] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
  DELETE FROM public.portal_area_roles WHERE user_id=p_user_id AND area='einsatz_mt';
  IF cardinality(p_einsatz_roles)>0 THEN INSERT INTO public.portal_area_roles(user_id,area,roles) VALUES(p_user_id,'einsatz_mt',p_einsatz_roles); END IF;
 END IF;
 IF p_schulungen_roles IS NOT NULL THEN
  IF NOT p_schulungen_roles <@ ARRAY['user','sachbearbeiter','admin']::text[] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
  DELETE FROM public.portal_area_roles WHERE user_id=p_user_id AND area='schulungen';
  IF cardinality(p_schulungen_roles)>0 THEN INSERT INTO public.portal_area_roles(user_id,area,roles) VALUES(p_user_id,'schulungen',p_schulungen_roles); END IF;
 END IF;
 IF p_fuhrpark_roles IS NOT NULL THEN
  IF NOT p_fuhrpark_roles <@ ARRAY['user','sachbearbeiter','admin']::text[] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
  DELETE FROM public.portal_area_roles WHERE user_id=p_user_id AND area='fuhrpark';
  IF cardinality(p_fuhrpark_roles)>0 THEN INSERT INTO public.portal_area_roles(user_id,area,roles) VALUES(p_user_id,'fuhrpark',p_fuhrpark_roles); END IF;
 END IF;
 IF p_zentrale_roles IS NOT NULL THEN
  IF NOT p_zentrale_roles <@ ARRAY['user','zentralist','sachbearbeiter','admin']::text[] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
  DELETE FROM public.portal_area_roles WHERE user_id=p_user_id AND area='zentrale';
  IF cardinality(p_zentrale_roles)>0 THEN INSERT INTO public.portal_area_roles(user_id,area,roles) VALUES(p_user_id,'zentrale',p_zentrale_roles); END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_portal_profile_v4(uuid,jsonb,text[],text[],text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_portal_profile_v4(uuid,jsonb,text[],text[],text[],text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_support_topic(p_topic text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role('admin')
 OR (p_topic='bekleidung' AND (public.has_portal_area_role('bekleidung','sachbearbeiter') OR public.has_portal_area_role('bekleidung','admin')))
 OR (p_topic='einsatz_mt' AND (public.has_portal_area_role('einsatz_mt','sachbearbeiter') OR public.has_portal_area_role('einsatz_mt','admin')))
 OR (p_topic='schulungen' AND (public.has_portal_area_role('schulungen','sachbearbeiter') OR public.has_portal_area_role('schulungen','admin')))
 OR (p_topic='fuhrpark' AND (public.has_portal_area_role('fuhrpark','sachbearbeiter') OR public.has_portal_area_role('fuhrpark','admin')))
 OR (p_topic='zentrale' AND (public.has_portal_area_role('zentrale','zentralist') OR public.has_portal_area_role('zentrale','sachbearbeiter') OR public.has_portal_area_role('zentrale','admin')));
$$;
REVOKE ALL ON FUNCTION public.can_manage_support_topic(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_support_topic(text) TO authenticated;
