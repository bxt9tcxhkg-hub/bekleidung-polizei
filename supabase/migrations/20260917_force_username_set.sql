-- Live: profiles.username ist NOT NULL. Erst Constraint lockern, dann DN-Werte leeren.
-- Username bleibt NULL bis zum Erstlogin (PC-Anmeldename). Nie dn{N}.
-- Idempotent: DROP NOT NULL, DROP CHECK, UPDATE … WHERE, CREATE OR REPLACE.

-- 1) NOT NULL (und ggf. CHECK, der leer/null verbietet)
ALTER TABLE public.profiles
  ALTER COLUMN username DROP NOT NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'profiles'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ~* 'username'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_username_set boolean NOT NULL DEFAULT false;

-- UNIQUE bleibt; mehrere NULL sind in Postgres erlaubt.
-- Partielle Unique nur auf gesetzte PC-Namen (idempotent, falls der alte UNIQUE-Name existiert).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_key;
DROP INDEX IF EXISTS profiles_username_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (username)
  WHERE username IS NOT NULL;

-- 2) Datenfix: falsche DN-Usernames (dn7, dn32, …). Zweiter Lauf ändert 0 Zeilen.
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
