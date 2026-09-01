-- Benutzerverwaltung laut Betreiber:
-- Anlegen: Sachbearbeiter und Genehmiger (Admin = alle Bereiche).
-- Entfernen = Deaktivieren (active=false), kein Auth-Löschen: nur Genehmiger/Admin.

-- Genehmiger braucht UPDATE auf profiles (bisher nur Admin/Sachbearbeiter).
DROP POLICY IF EXISTS "Sachbearbeiter bearbeitet Profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff bearbeitet Profile" ON public.profiles;
CREATE POLICY "Staff bearbeitet Profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver'))
  WITH CHECK (has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver'));

-- active nur Genehmiger/Admin; Rollen/Org/Benutzername weiter Staff.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.active IS DISTINCT FROM OLD.active
     AND NOT (has_role('admin') OR has_role('genehmiger') OR has_role('approver')) THEN
    RAISE EXCEPTION 'Keine Berechtigung, den Benutzerstatus zu ändern';
  END IF;

  IF NOT (has_role('admin') OR has_role('sachbearbeiter') OR has_role('genehmiger') OR has_role('approver'))
     AND (NEW.roles IS DISTINCT FROM OLD.roles
          OR NEW.organisation IS DISTINCT FROM OLD.organisation
          OR NEW.username IS DISTINCT FROM OLD.username) THEN
    RAISE EXCEPTION 'Keine Berechtigung, diese Profilfelder zu ändern';
  END IF;

  RETURN NEW;
END $$;
