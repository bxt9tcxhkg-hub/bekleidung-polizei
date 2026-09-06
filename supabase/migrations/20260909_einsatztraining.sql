-- Portal Phase 3a: Einsatztraining (Module, Trainingstage, Protokoll, Modul-Sperre).
-- Kein Lehrplan-Seed: Module legt SB/Admin an (Name, intern/extern, aktiv).
-- Taktung (Dokumentation, nicht als DB-Zwang): intern 1×/Halbjahr, extern 4×/Jahr.
-- Rechte über bestehende has_portal_area_access / can_manage_einsatzmittel
-- (einsatz_mt: Lesen jede Rolle; Schreiben SB/Admin) plus globales Admin.
-- Persönliche/Pool-EM unverändert. Kein Genehmiger.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

CREATE TABLE IF NOT EXISTS public.einsatz_training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('intern', 'extern')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id),
  CONSTRAINT einsatz_training_modules_name_nonempty CHECK (length(trim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_et_modules_name_kind
  ON public.einsatz_training_modules (lower(trim(name)), kind);

CREATE INDEX IF NOT EXISTS idx_et_modules_kind_active
  ON public.einsatz_training_modules (kind, active);

CREATE TABLE IF NOT EXISTS public.einsatz_training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('intern', 'extern')),
  session_date date NOT NULL,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id)
);

CREATE INDEX IF NOT EXISTS idx_et_sessions_kind_date
  ON public.einsatz_training_sessions (kind, session_date DESC);

CREATE TABLE IF NOT EXISTS public.einsatz_training_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.einsatz_training_sessions (id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.profiles (id),
  status text NOT NULL CHECK (status IN ('present', 'absent')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (session_id, officer_id)
);

CREATE INDEX IF NOT EXISTS idx_et_attendance_session
  ON public.einsatz_training_attendance (session_id);

CREATE INDEX IF NOT EXISTS idx_et_attendance_officer
  ON public.einsatz_training_attendance (officer_id);

CREATE TABLE IF NOT EXISTS public.einsatz_training_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.einsatz_training_sessions (id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.profiles (id),
  module_id uuid NOT NULL REFERENCES public.einsatz_training_modules (id),
  interval_label text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id),
  CONSTRAINT et_participation_interval_nonempty CHECK (
    interval_label IS NULL OR length(trim(interval_label)) > 0
  ),
  UNIQUE (session_id, officer_id, module_id),
  UNIQUE (officer_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_et_participations_session
  ON public.einsatz_training_participations (session_id);

CREATE TABLE IF NOT EXISTS public.einsatz_training_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.profiles (id),
  module_id uuid NOT NULL REFERENCES public.einsatz_training_modules (id),
  session_id uuid NOT NULL REFERENCES public.einsatz_training_sessions (id) ON DELETE CASCADE,
  participation_id uuid NOT NULL REFERENCES public.einsatz_training_participations (id) ON DELETE CASCADE,
  completed_on date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (officer_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_et_completions_officer
  ON public.einsatz_training_completions (officer_id);

CREATE INDEX IF NOT EXISTS idx_et_completions_module
  ON public.einsatz_training_completions (module_id);

DROP TRIGGER IF EXISTS einsatz_training_modules_updated_at ON public.einsatz_training_modules;
CREATE TRIGGER einsatz_training_modules_updated_at
  BEFORE UPDATE ON public.einsatz_training_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS einsatz_training_sessions_updated_at ON public.einsatz_training_sessions;
CREATE TRIGGER einsatz_training_sessions_updated_at
  BEFORE UPDATE ON public.einsatz_training_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS einsatz_training_attendance_updated_at ON public.einsatz_training_attendance;
CREATE TRIGGER einsatz_training_attendance_updated_at
  BEFORE UPDATE ON public.einsatz_training_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Modul-Sperre: Abschlusszeile je (Person, Modul). Teilnahme legt sie an;
-- Löschen der Teilnahme entfernt den Abschluss (Korrektur durch SB).
CREATE OR REPLACE FUNCTION public.sync_einsatz_training_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_date date;
  v_session_kind text;
  v_module_kind text;
BEGIN
  SELECT s.session_date, s.kind INTO v_date, v_session_kind
  FROM public.einsatz_training_sessions s
  WHERE s.id = NEW.session_id;

  SELECT m.kind INTO v_module_kind
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
  IF v_module_kind IS DISTINCT FROM v_session_kind THEN
    RAISE EXCEPTION 'Modulart muss zur Trainingsart passen (intern/extern)';
  END IF;

  IF v_session_kind = 'intern' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.einsatz_training_attendance a
      WHERE a.session_id = NEW.session_id
        AND a.officer_id = NEW.officer_id
        AND a.status = 'present'
    ) THEN
      RAISE EXCEPTION 'Nur Anwesende können einem Modul zugewiesen werden';
    END IF;
    IF NEW.interval_label IS NULL OR length(trim(NEW.interval_label)) = 0 THEN
      RAISE EXCEPTION 'Bitte das Intervall angeben';
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

DROP TRIGGER IF EXISTS einsatz_training_participation_sync
  ON public.einsatz_training_participations;
CREATE TRIGGER einsatz_training_participation_sync
  AFTER INSERT OR UPDATE ON public.einsatz_training_participations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_einsatz_training_completion();

REVOKE ALL ON FUNCTION public.sync_einsatz_training_completion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_einsatz_training_completion() TO authenticated;

ALTER TABLE public.einsatz_training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.einsatz_training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.einsatz_training_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.einsatz_training_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.einsatz_training_completions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.einsatz_training_modules FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.einsatz_training_sessions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.einsatz_training_attendance FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.einsatz_training_participations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.einsatz_training_completions FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.einsatz_training_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.einsatz_training_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.einsatz_training_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.einsatz_training_participations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.einsatz_training_completions TO authenticated;

DROP POLICY IF EXISTS "Einsatztraining-Module lesen" ON public.einsatz_training_modules;
CREATE POLICY "Einsatztraining-Module lesen" ON public.einsatz_training_modules
  FOR SELECT TO authenticated
  USING (has_portal_area_access('einsatz_mt'));

DROP POLICY IF EXISTS "Einsatztraining-Module schreiben" ON public.einsatz_training_modules;
CREATE POLICY "Einsatztraining-Module schreiben" ON public.einsatz_training_modules
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Module ändern" ON public.einsatz_training_modules;
CREATE POLICY "Einsatztraining-Module ändern" ON public.einsatz_training_modules
  FOR UPDATE TO authenticated
  USING (can_manage_einsatzmittel())
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Module löschen" ON public.einsatz_training_modules;
CREATE POLICY "Einsatztraining-Module löschen" ON public.einsatz_training_modules
  FOR DELETE TO authenticated
  USING (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Tage lesen" ON public.einsatz_training_sessions;
CREATE POLICY "Einsatztraining-Tage lesen" ON public.einsatz_training_sessions
  FOR SELECT TO authenticated
  USING (has_portal_area_access('einsatz_mt'));

DROP POLICY IF EXISTS "Einsatztraining-Tage schreiben" ON public.einsatz_training_sessions;
CREATE POLICY "Einsatztraining-Tage schreiben" ON public.einsatz_training_sessions
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Tage ändern" ON public.einsatz_training_sessions;
CREATE POLICY "Einsatztraining-Tage ändern" ON public.einsatz_training_sessions
  FOR UPDATE TO authenticated
  USING (can_manage_einsatzmittel())
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Tage löschen" ON public.einsatz_training_sessions;
CREATE POLICY "Einsatztraining-Tage löschen" ON public.einsatz_training_sessions
  FOR DELETE TO authenticated
  USING (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Anwesenheit lesen" ON public.einsatz_training_attendance;
CREATE POLICY "Einsatztraining-Anwesenheit lesen" ON public.einsatz_training_attendance
  FOR SELECT TO authenticated
  USING (has_portal_area_access('einsatz_mt'));

DROP POLICY IF EXISTS "Einsatztraining-Anwesenheit schreiben" ON public.einsatz_training_attendance;
CREATE POLICY "Einsatztraining-Anwesenheit schreiben" ON public.einsatz_training_attendance
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Anwesenheit ändern" ON public.einsatz_training_attendance;
CREATE POLICY "Einsatztraining-Anwesenheit ändern" ON public.einsatz_training_attendance
  FOR UPDATE TO authenticated
  USING (can_manage_einsatzmittel())
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Anwesenheit löschen" ON public.einsatz_training_attendance;
CREATE POLICY "Einsatztraining-Anwesenheit löschen" ON public.einsatz_training_attendance
  FOR DELETE TO authenticated
  USING (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Teilnahme lesen" ON public.einsatz_training_participations;
CREATE POLICY "Einsatztraining-Teilnahme lesen" ON public.einsatz_training_participations
  FOR SELECT TO authenticated
  USING (has_portal_area_access('einsatz_mt'));

DROP POLICY IF EXISTS "Einsatztraining-Teilnahme schreiben" ON public.einsatz_training_participations;
CREATE POLICY "Einsatztraining-Teilnahme schreiben" ON public.einsatz_training_participations
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Teilnahme ändern" ON public.einsatz_training_participations;
CREATE POLICY "Einsatztraining-Teilnahme ändern" ON public.einsatz_training_participations
  FOR UPDATE TO authenticated
  USING (can_manage_einsatzmittel())
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Teilnahme löschen" ON public.einsatz_training_participations;
CREATE POLICY "Einsatztraining-Teilnahme löschen" ON public.einsatz_training_participations
  FOR DELETE TO authenticated
  USING (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Abschlüsse lesen" ON public.einsatz_training_completions;
CREATE POLICY "Einsatztraining-Abschlüsse lesen" ON public.einsatz_training_completions
  FOR SELECT TO authenticated
  USING (has_portal_area_access('einsatz_mt'));

DROP POLICY IF EXISTS "Einsatztraining-Abschlüsse schreiben" ON public.einsatz_training_completions;
CREATE POLICY "Einsatztraining-Abschlüsse schreiben" ON public.einsatz_training_completions
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Abschlüsse ändern" ON public.einsatz_training_completions;
CREATE POLICY "Einsatztraining-Abschlüsse ändern" ON public.einsatz_training_completions
  FOR UPDATE TO authenticated
  USING (can_manage_einsatzmittel())
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatztraining-Abschlüsse löschen" ON public.einsatz_training_completions;
CREATE POLICY "Einsatztraining-Abschlüsse löschen" ON public.einsatz_training_completions
  FOR DELETE TO authenticated
  USING (can_manage_einsatzmittel());
