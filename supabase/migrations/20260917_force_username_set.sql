-- Erstlogin: PC-Anmeldename (profiles.username) nach force_username_set.
-- Flag in profiles (nicht nur user_metadata — Metadata ist user-editierbar).
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_username_set boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, name, gender, organisation, roles, active, force_username_set)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'gender', 'male'),
    COALESCE(NEW.raw_user_meta_data->>'organisation', 'Stadtpolizei'),
    ARRAY['user']::text[],
    true,
    COALESCE((NEW.raw_user_meta_data->>'force_username_set')::boolean, false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

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
