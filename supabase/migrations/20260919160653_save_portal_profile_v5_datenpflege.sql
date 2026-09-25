-- save_portal_profile_v4 kennt den neuen Bereich "datenpflege" noch nicht -
-- ohne diese Erweiterung könnte ein Admin Datenpflege-Sachbearbeiter nur per
-- direktem SQL ernennen, nicht über die Benutzerverwaltung im Portal.
create or replace function public.save_portal_profile_v5(
  p_user_id uuid, p_patch jsonb, p_einsatz_roles text[], p_schulungen_roles text[],
  p_fuhrpark_roles text[], p_zentrale_roles text[], p_datenpflege_roles text[]
)
returns void
language plpgsql
set search_path to 'public'
as $function$
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
 IF (p_einsatz_roles IS NOT NULL OR p_schulungen_roles IS NOT NULL OR p_fuhrpark_roles IS NOT NULL OR p_zentrale_roles IS NOT NULL OR p_datenpflege_roles IS NOT NULL)
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
 IF p_datenpflege_roles IS NOT NULL THEN
  IF NOT p_datenpflege_roles <@ ARRAY['user','sachbearbeiter','admin']::text[] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
  DELETE FROM public.portal_area_roles WHERE user_id=p_user_id AND area='datenpflege';
  IF cardinality(p_datenpflege_roles)>0 THEN INSERT INTO public.portal_area_roles(user_id,area,roles) VALUES(p_user_id,'datenpflege',p_datenpflege_roles); END IF;
 END IF;
END $function$;

grant execute on function public.save_portal_profile_v5(uuid, jsonb, text[], text[], text[], text[], text[]) to authenticated;
revoke execute on function public.save_portal_profile_v4(uuid, jsonb, text[], text[], text[], text[]) from authenticated;
drop function public.save_portal_profile_v4(uuid, jsonb, text[], text[], text[], text[]);
