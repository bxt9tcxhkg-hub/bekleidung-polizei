-- Stammdaten sind für berechtigte Nutzer der Zentrale lesbar.
-- Anlegen, Ändern und Löschen ist ausschließlich Portal-Admins erlaubt.

DROP POLICY IF EXISTS "Personen anlegen" ON public.operational_persons;
DROP POLICY IF EXISTS "Personen ändern" ON public.operational_persons;
DROP POLICY IF EXISTS "Personen löschen" ON public.operational_persons;

CREATE POLICY "Personen anlegen"
ON public.operational_persons
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin')
  AND created_by = (SELECT auth.uid())
);

CREATE POLICY "Personen ändern"
ON public.operational_persons
FOR UPDATE
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

CREATE POLICY "Personen löschen"
ON public.operational_persons
FOR DELETE
TO authenticated
USING (public.has_role('admin'));

DROP POLICY IF EXISTS "Objekte anlegen" ON public.operational_objects;
DROP POLICY IF EXISTS "Objekte ändern" ON public.operational_objects;
DROP POLICY IF EXISTS "Objekte löschen" ON public.operational_objects;

CREATE POLICY "Objekte anlegen"
ON public.operational_objects
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin')
  AND created_by = (SELECT auth.uid())
);

CREATE POLICY "Objekte ändern"
ON public.operational_objects
FOR UPDATE
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

CREATE POLICY "Objekte löschen"
ON public.operational_objects
FOR DELETE
TO authenticated
USING (public.has_role('admin'));

DROP POLICY IF EXISTS "zentrale_schluessel anlegen" ON public.zentrale_schluessel;
DROP POLICY IF EXISTS "zentrale_schluessel ändern" ON public.zentrale_schluessel;
DROP POLICY IF EXISTS "zentrale_schluessel löschen" ON public.zentrale_schluessel;

CREATE POLICY "zentrale_schluessel anlegen"
ON public.zentrale_schluessel
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin')
  AND created_by = (SELECT auth.uid())
);

CREATE POLICY "zentrale_schluessel ändern"
ON public.zentrale_schluessel
FOR UPDATE
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

CREATE POLICY "zentrale_schluessel löschen"
ON public.zentrale_schluessel
FOR DELETE
TO authenticated
USING (public.has_role('admin'));

DROP POLICY IF EXISTS "zentrale_kontakte anlegen" ON public.zentrale_kontakte;
DROP POLICY IF EXISTS "zentrale_kontakte ändern" ON public.zentrale_kontakte;
DROP POLICY IF EXISTS "zentrale_kontakte löschen" ON public.zentrale_kontakte;

CREATE POLICY "zentrale_kontakte anlegen"
ON public.zentrale_kontakte
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role('admin')
  AND created_by = (SELECT auth.uid())
);

CREATE POLICY "zentrale_kontakte ändern"
ON public.zentrale_kontakte
FOR UPDATE
TO authenticated
USING (public.has_role('admin'))
WITH CHECK (public.has_role('admin'));

CREATE POLICY "zentrale_kontakte löschen"
ON public.zentrale_kontakte
FOR DELETE
TO authenticated
USING (public.has_role('admin'));
