-- Erstlogin: PC-Anmeldename (profiles.username) nach force_username_set.
-- Username bleibt NULL bis zum Erstlogin — nie dn{N} oder E-Mail-Local-Part.
-- Flag in profiles (nicht nur user_metadata — Metadata ist user-editierbar).
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP NOT NULL, CREATE OR REPLACE, UPDATE … WHERE.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_username_set boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ALTER COLUMN username DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_username text;
BEGIN
  meta_username := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
  IF meta_username IS NOT NULL AND meta_username ~* '^dn[0-9]+$' THEN
    meta_username := NULL;
  END IF;

  INSERT INTO public.profiles (id, username, name, gender, organisation, roles, active, force_username_set)
  VALUES (
    NEW.id,
    meta_username,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'gender', 'male'),
    COALESCE(NEW.raw_user_meta_data->>'organisation', 'Stadtpolizei'),
    ARRAY['user']::text[],
    true,
    COALESCE((NEW.raw_user_meta_data->>'force_username_set')::boolean, meta_username IS NULL)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Live: falsche DN-Usernames (dn7, dn32, …) leeren. Zweiter Lauf ändert 0 Zeilen.
UPDATE public.profiles
SET
  username = NULL,
  force_username_set = true
WHERE username ~* '^dn[0-9]+$';

UPDATE auth.users
SET raw_user_meta_data = (
  COALESCE(raw_user_meta_data, '{}'::jsonb)
  - 'username'
) || jsonb_build_object('force_username_set', true)
WHERE COALESCE(raw_user_meta_data->>'username', '') ~* '^dn[0-9]+$';

-- Staff darf weiter alles außer active (Genehmiger/Admin).
-- Normale Benutzer: eigener PC-Benutzername nur solange force_username_set.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_staff boolean;
  is_status_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
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
END $$;
