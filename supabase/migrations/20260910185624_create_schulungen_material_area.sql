
ALTER TABLE public.portal_area_roles DROP CONSTRAINT IF EXISTS portal_area_roles_area_check;
ALTER TABLE public.portal_area_roles ADD CONSTRAINT portal_area_roles_area_check CHECK (area IN ('bekleidung','einsatz_mt','schulungen'));
ALTER TABLE public.portal_area_roles DROP CONSTRAINT IF EXISTS portal_area_roles_roles_valid;
ALTER TABLE public.portal_area_roles ADD CONSTRAINT portal_area_roles_roles_valid CHECK (
  (area='bekleidung' AND roles <@ ARRAY['user','sachbearbeiter','genehmiger','admin']::text[])
  OR (area IN ('einsatz_mt','schulungen') AND roles <@ ARRAY['user','sachbearbeiter','admin']::text[])
);
ALTER TABLE public.einsatz_material_tabs DROP CONSTRAINT IF EXISTS einsatz_material_tabs_area_check;
ALTER TABLE public.einsatz_material_tabs ADD CONSTRAINT einsatz_material_tabs_area_check CHECK (area IN ('einsatzmittel','einsatztraining','schulungen'));

CREATE OR REPLACE FUNCTION public.can_manage_schulungen() RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.has_role('admin') OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN public.portal_area_roles r ON r.user_id=p.id
  WHERE p.id=(SELECT auth.uid()) AND p.active AND r.area='schulungen'
    AND r.roles && ARRAY['sachbearbeiter','admin']::text[]
 );
$$;
REVOKE ALL ON FUNCTION public.can_manage_schulungen() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_schulungen() TO authenticated;

DROP POLICY IF EXISTS "Unterlagen-Tabs lesen" ON public.einsatz_material_tabs;
DROP POLICY IF EXISTS "Unterlagen-Tabs anlegen" ON public.einsatz_material_tabs;
DROP POLICY IF EXISTS "Unterlagen-Tabs ändern" ON public.einsatz_material_tabs;
DROP POLICY IF EXISTS "Unterlagen-Tabs löschen" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs lesen" ON public.einsatz_material_tabs FOR SELECT TO authenticated USING (
 CASE WHEN area='schulungen'
 THEN public.has_portal_area_access('schulungen') AND (active OR public.can_manage_schulungen())
 ELSE public.has_portal_area_access('einsatz_mt') AND (active OR public.can_manage_einsatzmittel()) END
);
CREATE POLICY "Unterlagen-Tabs anlegen" ON public.einsatz_material_tabs FOR INSERT TO authenticated WITH CHECK (
 (area='schulungen' AND public.can_manage_schulungen())
 OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);
CREATE POLICY "Unterlagen-Tabs ändern" ON public.einsatz_material_tabs FOR UPDATE TO authenticated USING (
 (area='schulungen' AND public.can_manage_schulungen())
 OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
) WITH CHECK (
 (area='schulungen' AND public.can_manage_schulungen())
 OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);
CREATE POLICY "Unterlagen-Tabs löschen" ON public.einsatz_material_tabs FOR DELETE TO authenticated USING (
 (area='schulungen' AND public.can_manage_schulungen())
 OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);

DROP POLICY IF EXISTS "Einsatz-Unterlagen lesen" ON public.einsatz_materials;
DROP POLICY IF EXISTS "Einsatz-Unterlagen anlegen" ON public.einsatz_materials;
DROP POLICY IF EXISTS "Einsatz-Unterlagen ändern" ON public.einsatz_materials;
DROP POLICY IF EXISTS "Einsatz-Unterlagen löschen" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen lesen" ON public.einsatz_materials FOR SELECT TO authenticated USING (
 EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
   (t.area='schulungen' AND public.has_portal_area_access('schulungen')
    AND (public.can_manage_schulungen() OR (t.active AND published AND archived_at IS NULL)))
   OR
   (t.area IN ('einsatzmittel','einsatztraining') AND public.has_portal_area_access('einsatz_mt')
    AND (public.can_manage_einsatzmittel() OR (t.active AND published AND archived_at IS NULL)))
 ))
);
CREATE POLICY "Einsatz-Unterlagen anlegen" ON public.einsatz_materials FOR INSERT TO authenticated WITH CHECK (
 EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND t.active AND (
  (t.area='schulungen' AND public.can_manage_schulungen())
  OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
 ))
);
CREATE POLICY "Einsatz-Unterlagen ändern" ON public.einsatz_materials FOR UPDATE TO authenticated USING (
 EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
  (t.area='schulungen' AND public.can_manage_schulungen())
  OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
 ))
) WITH CHECK (
 EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND t.active AND (
  (t.area='schulungen' AND public.can_manage_schulungen())
  OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
 ))
);
CREATE POLICY "Einsatz-Unterlagen löschen" ON public.einsatz_materials FOR DELETE TO authenticated USING (
 EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
  (t.area='schulungen' AND public.can_manage_schulungen())
  OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
 ))
);

CREATE OR REPLACE FUNCTION public.move_einsatz_material(p_material_id uuid,p_target_tab_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source_tab_id uuid; source_area text; target_area text;
BEGIN
 SELECT m.tab_id,t.area INTO source_tab_id,source_area
 FROM public.einsatz_materials m JOIN public.einsatz_material_tabs t ON t.id=m.tab_id
 WHERE m.id=p_material_id AND m.archived_at IS NULL FOR UPDATE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unterlage nicht gefunden'; END IF;
 IF source_area='schulungen' THEN
  IF NOT public.can_manage_schulungen() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
 ELSIF NOT public.can_manage_einsatzmittel() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
 SELECT area INTO target_area FROM public.einsatz_material_tabs WHERE id=p_target_tab_id AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ziel-Tab nicht gefunden'; END IF;
 IF source_area IS DISTINCT FROM target_area THEN RAISE EXCEPTION 'Unterlagen können nur innerhalb desselben Bereichs verschoben werden'; END IF;
 UPDATE public.einsatz_materials SET tab_id=p_target_tab_id,updated_at=now() WHERE id=p_material_id;
END $$;
REVOKE ALL ON FUNCTION public.move_einsatz_material(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_einsatz_material(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_portal_profile_v2(p_user_id uuid,p_patch jsonb,p_einsatz_roles text[],p_schulungen_roles text[])
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
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
 IF (p_einsatz_roles IS NOT NULL OR p_schulungen_roles IS NOT NULL) AND p_user_id=(SELECT auth.uid()) THEN
  RAISE EXCEPTION 'Eigene Bereichsrechte können nicht geändert werden';
 END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.save_portal_profile_v2(uuid,jsonb,text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_portal_profile_v2(uuid,jsonb,text[],text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_support_topic(p_topic text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.has_role('admin')
 OR (p_topic='bekleidung' AND (public.has_portal_area_role('bekleidung','sachbearbeiter') OR public.has_portal_area_role('bekleidung','admin')))
 OR (p_topic='einsatz_mt' AND (public.has_portal_area_role('einsatz_mt','sachbearbeiter') OR public.has_portal_area_role('einsatz_mt','admin')))
 OR (p_topic='schulungen' AND (public.has_portal_area_role('schulungen','sachbearbeiter') OR public.has_portal_area_role('schulungen','admin')));
$$;
REVOKE ALL ON FUNCTION public.can_manage_support_topic(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_support_topic(text) TO authenticated;

INSERT INTO public.portal_area_roles(user_id,area,roles)
SELECT id,'schulungen',ARRAY['user']::text[] FROM public.profiles
WHERE active AND NOT (roles @> ARRAY['admin']::text[])
ON CONFLICT(user_id,area) DO NOTHING;
INSERT INTO public.einsatz_material_tabs(area,name,description,sort_order)
SELECT 'schulungen','Allgemein','Allgemeine Schulungsunterlagen und Informationen',0
WHERE NOT EXISTS (SELECT 1 FROM public.einsatz_material_tabs WHERE area='schulungen' AND lower(trim(name))='allgemein' AND active);
