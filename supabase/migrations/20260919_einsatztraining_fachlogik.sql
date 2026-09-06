-- Einsatztraining Owner-Fachlogik 2026-09-06:
-- Primärachse pflicht_halbjahr vs zusatz (nicht intern/extern).
-- Internes ET = Pflicht im Halbjahr (alle Stadtpolizei Dornbirn).
-- Combat / Erste Hilfe COMBAT / Fahrsicherheit / Stock / Szenarien = Zusatz.
-- kind intern/extern bleibt als Herkunftsfilter.
-- schiesst am Modul. Ausschreibung + Selbstanmeldung. Session.module_id.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

ALTER TABLE public.einsatz_training_modules
  ADD COLUMN IF NOT EXISTS module_type text;

ALTER TABLE public.einsatz_training_modules
  ADD COLUMN IF NOT EXISTS schiesst boolean NOT NULL DEFAULT false;

ALTER TABLE public.einsatz_training_modules
  ADD COLUMN IF NOT EXISTS period_year integer;

ALTER TABLE public.einsatz_training_modules
  ADD COLUMN IF NOT EXISTS period_half integer;

UPDATE public.einsatz_training_modules
SET module_type = 'pflicht_halbjahr',
    period_year = COALESCE(period_year, 2026),
    period_half = COALESCE(period_half, 2)
WHERE lower(trim(name)) = 'internes et';

UPDATE public.einsatz_training_modules
SET module_type = 'zusatz',
    period_year = NULL,
    period_half = NULL
WHERE module_type IS DISTINCT FROM 'pflicht_halbjahr';

UPDATE public.einsatz_training_modules
SET module_type = 'zusatz'
WHERE module_type IS NULL;

ALTER TABLE public.einsatz_training_modules
  ALTER COLUMN module_type SET DEFAULT 'zusatz';

ALTER TABLE public.einsatz_training_modules
  ALTER COLUMN module_type SET NOT NULL;

ALTER TABLE public.einsatz_training_modules
  DROP CONSTRAINT IF EXISTS einsatz_training_modules_module_type_check;

ALTER TABLE public.einsatz_training_modules
  ADD CONSTRAINT einsatz_training_modules_module_type_check
  CHECK (module_type IN ('pflicht_halbjahr', 'zusatz'));

ALTER TABLE public.einsatz_training_modules
  DROP CONSTRAINT IF EXISTS einsatz_training_modules_period_half_check;

ALTER TABLE public.einsatz_training_modules
  ADD CONSTRAINT einsatz_training_modules_period_half_check
  CHECK (period_half IS NULL OR period_half IN (1, 2));

ALTER TABLE public.einsatz_training_modules
  DROP CONSTRAINT IF EXISTS einsatz_training_modules_pflicht_period_check;

ALTER TABLE public.einsatz_training_modules
  ADD CONSTRAINT einsatz_training_modules_pflicht_period_check
  CHECK (
    (module_type = 'zusatz' AND period_year IS NULL AND period_half IS NULL)
    OR (
      module_type = 'pflicht_halbjahr'
      AND period_year IS NOT NULL
      AND period_half IN (1, 2)
    )
  );

DROP INDEX IF EXISTS public.idx_et_modules_name_kind;

CREATE UNIQUE INDEX IF NOT EXISTS idx_et_modules_pflicht_name_period
  ON public.einsatz_training_modules (lower(trim(name)), period_year, period_half)
  WHERE module_type = 'pflicht_halbjahr';

CREATE UNIQUE INDEX IF NOT EXISTS idx_et_modules_zusatz_name
  ON public.einsatz_training_modules (lower(trim(name)))
  WHERE module_type = 'zusatz';

CREATE INDEX IF NOT EXISTS idx_et_modules_type_active
  ON public.einsatz_training_modules (module_type, active);

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS module_id uuid REFERENCES public.einsatz_training_modules (id);

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS capacity integer;

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS announced boolean NOT NULL DEFAULT false;

ALTER TABLE public.einsatz_training_sessions
  DROP CONSTRAINT IF EXISTS einsatz_training_sessions_capacity_check;

ALTER TABLE public.einsatz_training_sessions
  ADD CONSTRAINT einsatz_training_sessions_capacity_check
  CHECK (capacity IS NULL OR capacity > 0);

UPDATE public.einsatz_training_sessions s
SET module_id = p.module_id
FROM (
  SELECT session_id, (min(module_id::text))::uuid AS module_id
  FROM public.einsatz_training_participations
  GROUP BY session_id
  HAVING count(DISTINCT module_id) = 1
) p
WHERE s.id = p.session_id
  AND s.module_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_et_sessions_module_date
  ON public.einsatz_training_sessions (module_id, session_date DESC);

CREATE TABLE IF NOT EXISTS public.einsatz_training_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.einsatz_training_sessions (id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (session_id, officer_id)
);

CREATE INDEX IF NOT EXISTS idx_et_registrations_session
  ON public.einsatz_training_registrations (session_id);

CREATE INDEX IF NOT EXISTS idx_et_registrations_officer
  ON public.einsatz_training_registrations (officer_id);

-- Abschluss-Trigger: intern/extern-Match und Intervallpflicht entfallen.
-- Neues Protokoll: Session.module_id bindet den Tag; nur Anwesende, wenn
-- Anwesenheit existiert oder das Session-Modul gesetzt ist.
CREATE OR REPLACE FUNCTION public.sync_einsatz_training_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_date date;
  v_session_kind text;
  v_session_module uuid;
  v_module_kind text;
  v_module_type text;
  v_period_year integer;
  v_period_half integer;
BEGIN
  SELECT s.session_date, s.kind, s.module_id
    INTO v_date, v_session_kind, v_session_module
  FROM public.einsatz_training_sessions s
  WHERE s.id = NEW.session_id;

  SELECT m.kind, m.module_type, m.period_year, m.period_half
    INTO v_module_kind, v_module_type, v_period_year, v_period_half
  FROM public.einsatz_training_modules m
  WHERE m.id = NEW.module_id;

  IF TG_OP = 'UPDATE' THEN
    DELETE FROM public.einsatz_training_completions
    WHERE participation_id = NEW.id
      AND module_id IS DISTINCT FROM NEW.module_id;
  END IF;

  IF v_session_kind IS NULL THEN
    RAISE EXCEPTION 'Trainingstag nicht gefunden';
  END IF;
  IF v_module_kind IS NULL THEN
    RAISE EXCEPTION 'Modul nicht gefunden';
  END IF;
  IF v_session_module IS NOT NULL AND v_session_module IS DISTINCT FROM NEW.module_id THEN
    RAISE EXCEPTION 'Am Trainingstag gilt das gewählte Modul';
  END IF;

  IF v_session_module IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.einsatz_training_attendance a
       WHERE a.session_id = NEW.session_id
     )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.einsatz_training_attendance a
      WHERE a.session_id = NEW.session_id
        AND a.officer_id = NEW.officer_id
        AND a.status = 'present'
    ) THEN
      RAISE EXCEPTION 'Nur Anwesende können einem Modul zugewiesen werden';
    END IF;
  END IF;

  IF v_module_type = 'pflicht_halbjahr'
     AND v_period_year IS NOT NULL
     AND v_period_half IN (1, 2)
     AND v_date IS NOT NULL
  THEN
    IF v_period_half = 1 AND (v_date < make_date(v_period_year, 1, 1) OR v_date > make_date(v_period_year, 6, 30)) THEN
      RAISE EXCEPTION 'Das Datum liegt außerhalb des Pflicht-Halbjahrs';
    END IF;
    IF v_period_half = 2 AND (v_date < make_date(v_period_year, 7, 1) OR v_date > make_date(v_period_year, 12, 31)) THEN
      RAISE EXCEPTION 'Das Datum liegt außerhalb des Pflicht-Halbjahrs';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.einsatz_training_completions c
    WHERE c.officer_id = NEW.officer_id
      AND c.module_id = NEW.module_id
      AND c.participation_id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Modul bereits abgeschlossen';
  END IF;

  INSERT INTO public.einsatz_training_completions (
    officer_id, module_id, session_id, participation_id, completed_on
  ) VALUES (
    NEW.officer_id,
    NEW.module_id,
    NEW.session_id,
    NEW.id,
    COALESCE(v_date, CURRENT_DATE)
  )
  ON CONFLICT (officer_id, module_id) DO UPDATE
    SET session_id = EXCLUDED.session_id,
        participation_id = EXCLUDED.participation_id,
        completed_on = EXCLUDED.completed_on
    WHERE public.einsatz_training_completions.participation_id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_self_register_einsatztraining(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_announced boolean;
  v_capacity integer;
  v_module uuid;
  v_count integer;
BEGIN
  IF NOT public.has_portal_area_access('einsatz_mt') THEN
    RETURN false;
  END IF;

  SELECT s.announced, s.capacity, s.module_id
    INTO v_announced, v_capacity, v_module
  FROM public.einsatz_training_sessions s
  WHERE s.id = p_session_id;

  IF v_module IS NULL OR v_announced IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.einsatz_training_completions c
    WHERE c.officer_id = auth.uid()
      AND c.module_id = v_module
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.einsatz_training_registrations r
    WHERE r.session_id = p_session_id
      AND r.officer_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.einsatz_training_registrations r
    WHERE r.session_id = p_session_id;
    IF v_count >= v_capacity THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_einsatz_training_registration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_announced boolean;
  v_capacity integer;
  v_module uuid;
  v_count integer;
BEGIN
  SELECT s.announced, s.capacity, s.module_id
    INTO v_announced, v_capacity, v_module
  FROM public.einsatz_training_sessions s
  WHERE s.id = NEW.session_id;

  IF v_module IS NULL THEN
    RAISE EXCEPTION 'Trainingsprogramm braucht ein Modul';
  END IF;

  IF NOT public.can_manage_einsatzmittel() THEN
    IF v_announced IS NOT TRUE THEN
      RAISE EXCEPTION 'Dieses Trainingsprogramm ist noch nicht ausgeschrieben';
    END IF;
    IF NEW.officer_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Anmeldung nur für das eigene Konto';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.einsatz_training_completions c
    WHERE c.officer_id = NEW.officer_id
      AND c.module_id = v_module
  ) THEN
    RAISE EXCEPTION 'Modul bereits abgeschlossen';
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.einsatz_training_registrations r
    WHERE r.session_id = NEW.session_id
      AND r.id IS DISTINCT FROM NEW.id;
    IF v_count >= v_capacity THEN
      RAISE EXCEPTION 'Keine freien Plätze mehr';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS einsatz_training_registration_enforce
  ON public.einsatz_training_registrations;
CREATE TRIGGER einsatz_training_registration_enforce
  BEFORE INSERT OR UPDATE ON public.einsatz_training_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_einsatz_training_registration();

REVOKE ALL ON FUNCTION public.can_self_register_einsatztraining(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_self_register_einsatztraining(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.enforce_einsatz_training_registration() FROM PUBLIC, anon;

ALTER TABLE public.einsatz_training_registrations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.einsatz_training_registrations FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.einsatz_training_registrations TO authenticated;

DROP POLICY IF EXISTS "Einsatztraining-Anmeldungen lesen" ON public.einsatz_training_registrations;
CREATE POLICY "Einsatztraining-Anmeldungen lesen" ON public.einsatz_training_registrations
  FOR SELECT TO authenticated
  USING (
    public.can_manage_einsatzmittel()
    OR officer_id = auth.uid()
  );

DROP POLICY IF EXISTS "Einsatztraining-Anmeldungen schreiben" ON public.einsatz_training_registrations;
CREATE POLICY "Einsatztraining-Anmeldungen schreiben" ON public.einsatz_training_registrations
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_einsatzmittel()
    OR (
      officer_id = auth.uid()
      AND public.can_self_register_einsatztraining(session_id)
    )
  );

DROP POLICY IF EXISTS "Einsatztraining-Anmeldungen löschen" ON public.einsatz_training_registrations;
CREATE POLICY "Einsatztraining-Anmeldungen löschen" ON public.einsatz_training_registrations
  FOR DELETE TO authenticated
  USING (
    public.can_manage_einsatzmittel()
    OR officer_id = auth.uid()
  );
