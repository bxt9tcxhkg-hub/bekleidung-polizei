CREATE OR REPLACE FUNCTION public.protect_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_staff boolean;
  is_status_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Die Benutzer-ID kann nicht geändert werden';
  END IF;
  IF NOT has_role('admin') THEN
    IF ('admin' = ANY(OLD.roles) AND NEW IS DISTINCT FROM OLD)
       OR ('admin' = ANY(NEW.roles)) IS DISTINCT FROM ('admin' = ANY(OLD.roles)) THEN
      RAISE EXCEPTION 'Nur Admins dürfen Adminprofile oder Adminrechte ändern';
    END IF;
    IF NOT (has_role('genehmiger') OR has_role('approver')) AND
      (ARRAY(SELECT unnest(NEW.roles) INTERSECT SELECT unnest(ARRAY['genehmiger','approver']))
       IS DISTINCT FROM ARRAY(SELECT unnest(OLD.roles) INTERSECT SELECT unnest(ARRAY['genehmiger','approver']))) THEN
      RAISE EXCEPTION 'Keine Berechtigung, Genehmigerrechte zu ändern';
    END IF;
  END IF;

  is_staff := has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver');
  is_status_staff := has_role('admin') OR has_role('genehmiger') OR has_role('approver');

  IF NEW.active IS DISTINCT FROM OLD.active
     AND NOT is_status_staff THEN
    RAISE EXCEPTION 'Keine Berechtigung, den Benutzerstatus zu ändern';
  END IF;

  IF NEW.force_username_set IS DISTINCT FROM OLD.force_username_set
     AND NOT is_staff THEN
    IF NOT (
      NEW.id = auth.uid()
      AND OLD.force_username_set IS TRUE
      AND NEW.force_username_set IS FALSE
    ) THEN
      RAISE EXCEPTION 'Keine Berechtigung, diese Profilfelder zu ändern';
    END IF;
  END IF;

  IF NEW.roles IS DISTINCT FROM OLD.roles
     OR NEW.organisation IS DISTINCT FROM OLD.organisation THEN
    IF NOT is_staff THEN
      RAISE EXCEPTION 'Keine Berechtigung, diese Profilfelder zu ändern';
    END IF;
  END IF;

  IF NEW.username IS DISTINCT FROM OLD.username
     AND NOT is_staff THEN
    IF NOT (NEW.id = auth.uid() AND OLD.force_username_set IS TRUE) THEN
      RAISE EXCEPTION 'Keine Berechtigung, diese Profilfelder zu ändern';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.save_portal_profile(p_user_id uuid,p_patch jsonb,p_einsatz_roles text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.profiles%ROWTYPE;
BEGIN
  IF NOT has_role('admin') THEN
    RAISE EXCEPTION 'Nur Admins dürfen Benutzer- und Bereichsrechte gemeinsam bearbeiten';
  END IF;
  IF p_patch - ARRAY['name','username','dienstnummer','roles','gender','organisation','dienstgrad','active','force_username_set'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Ungültige Profilfelder';
  END IF;
  SELECT * INTO target FROM profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Benutzer nicht gefunden'; END IF;
  SELECT * INTO target FROM jsonb_populate_record(target,p_patch);
  UPDATE profiles SET name=target.name,username=target.username,dienstnummer=target.dienstnummer,roles=target.roles,
    gender=target.gender,organisation=target.organisation,dienstgrad=target.dienstgrad,
    active=target.active,force_username_set=target.force_username_set WHERE id=p_user_id;
  IF p_einsatz_roles IS NOT NULL THEN
    IF NOT has_role('admin') OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Keine Berechtigung zur Bereichsrechteänderung'; END IF;
    IF NOT p_einsatz_roles <@ ARRAY['user','sachbearbeiter','admin'] THEN RAISE EXCEPTION 'Ungültige Bereichsrolle'; END IF;
    DELETE FROM portal_area_roles WHERE user_id=p_user_id AND area='einsatz_mt';
    IF cardinality(p_einsatz_roles)>0 THEN
      INSERT INTO portal_area_roles(user_id,area,roles) VALUES(p_user_id,'einsatz_mt',p_einsatz_roles);
    END IF;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_portal_profile(uuid,jsonb,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_portal_profile(uuid,jsonb,text[]) TO authenticated;
