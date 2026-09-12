-- Schulungen: Modul-/Termin-Tracking, analog zu Einsatztraining (Pakete 5),
-- aber bewusst einfacher: Module sind einmalig/ad-hoc, keine Halbjahres-/
-- Perioden-Pflicht wie bei Einsatztraining. Der Sachbearbeiter legt fest,
-- was geschult werden muss (Module, Termine), Anmeldung/Zuteilung läuft wie
-- bei Einsatztraining über einen Vorschlag, den der Genehmiger entscheidet
-- (dieselbe is_genehmiger()-Freigabe wie bei einsatz_training_assignments).

CREATE TABLE public.schulungen_module (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE UNIQUE INDEX schulungen_module_name_idx ON public.schulungen_module (lower(trim(name)));

CREATE TABLE public.schulungen_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.schulungen_module(id),
  session_date date NOT NULL,
  note text CHECK (note IS NULL OR length(note) <= 500),
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  announced boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX schulungen_sessions_module_idx ON public.schulungen_sessions (module_id, session_date DESC);

CREATE TABLE public.schulungen_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.schulungen_sessions(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, officer_id)
);
CREATE INDEX schulungen_registrations_officer_idx ON public.schulungen_registrations (officer_id);

CREATE TABLE public.schulungen_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.profiles(id),
  module_id uuid NOT NULL REFERENCES public.schulungen_module(id),
  session_id uuid REFERENCES public.schulungen_sessions(id) ON DELETE SET NULL,
  completed_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (officer_id, module_id)
);
CREATE INDEX schulungen_completions_module_idx ON public.schulungen_completions (module_id);

-- Vorschlag/Entscheidung: identisch zu einsatz_training_assignments, nur für
-- Schulungen. session_id ist nullable (allgemeiner Vorschlag ohne Termin).
CREATE TABLE public.schulungen_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.profiles(id),
  module_id uuid NOT NULL REFERENCES public.schulungen_module(id),
  session_id uuid REFERENCES public.schulungen_sessions(id),
  status text NOT NULL DEFAULT 'vorschlag' CHECK (status IN ('vorschlag','eingeteilt','abgelehnt')),
  proposed_by uuid NOT NULL REFERENCES public.profiles(id),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX schulungen_assignments_officer_idx ON public.schulungen_assignments(officer_id);
CREATE INDEX schulungen_assignments_module_idx ON public.schulungen_assignments(module_id);
CREATE INDEX schulungen_assignments_status_idx ON public.schulungen_assignments(status) WHERE status = 'vorschlag';

DROP TRIGGER IF EXISTS schulungen_module_updated_at ON public.schulungen_module;
CREATE TRIGGER schulungen_module_updated_at BEFORE UPDATE ON public.schulungen_module
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS schulungen_sessions_updated_at ON public.schulungen_sessions;
CREATE TRIGGER schulungen_sessions_updated_at BEFORE UPDATE ON public.schulungen_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS schulungen_assignments_updated_at ON public.schulungen_assignments;
CREATE TRIGGER schulungen_assignments_updated_at BEFORE UPDATE ON public.schulungen_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.schulungen_module ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schulungen_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schulungen_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schulungen_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schulungen_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.schulungen_module FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.schulungen_sessions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.schulungen_registrations FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.schulungen_completions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.schulungen_assignments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schulungen_module TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schulungen_sessions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.schulungen_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schulungen_completions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.schulungen_assignments TO authenticated;

-- Module/Termine: Lesen für den ganzen Bereich, Schreiben SB/Admin/Genehmiger
-- (can_manage_schulungen() enthält seit Paket 2 bereits die Genehmiger-Rolle).
CREATE POLICY "Schulungen-Module lesen" ON public.schulungen_module FOR SELECT TO authenticated
 USING (public.has_portal_area_access('schulungen'));
CREATE POLICY "Schulungen-Module anlegen" ON public.schulungen_module FOR INSERT TO authenticated
 WITH CHECK (public.can_manage_schulungen());
CREATE POLICY "Schulungen-Module ändern" ON public.schulungen_module FOR UPDATE TO authenticated
 USING (public.can_manage_schulungen()) WITH CHECK (public.can_manage_schulungen());
CREATE POLICY "Schulungen-Module löschen" ON public.schulungen_module FOR DELETE TO authenticated
 USING (public.can_manage_schulungen());

CREATE POLICY "Schulungen-Termine lesen" ON public.schulungen_sessions FOR SELECT TO authenticated
 USING (public.has_portal_area_access('schulungen'));
CREATE POLICY "Schulungen-Termine anlegen" ON public.schulungen_sessions FOR INSERT TO authenticated
 WITH CHECK (public.can_manage_schulungen());
CREATE POLICY "Schulungen-Termine ändern" ON public.schulungen_sessions FOR UPDATE TO authenticated
 USING (public.can_manage_schulungen()) WITH CHECK (public.can_manage_schulungen());
CREATE POLICY "Schulungen-Termine löschen" ON public.schulungen_sessions FOR DELETE TO authenticated
 USING (public.can_manage_schulungen());

-- Abschlüsse: reines Tracking durch den Sachbearbeiter (kein Genehmiger-Zwang,
-- anders als bei der Zuteilung selbst).
CREATE POLICY "Schulungen-Abschlüsse lesen" ON public.schulungen_completions FOR SELECT TO authenticated
 USING (public.has_portal_area_access('schulungen'));
CREATE POLICY "Schulungen-Abschlüsse anlegen" ON public.schulungen_completions FOR INSERT TO authenticated
 WITH CHECK (public.can_manage_schulungen());
CREATE POLICY "Schulungen-Abschlüsse ändern" ON public.schulungen_completions FOR UPDATE TO authenticated
 USING (public.can_manage_schulungen()) WITH CHECK (public.can_manage_schulungen());
CREATE POLICY "Schulungen-Abschlüsse löschen" ON public.schulungen_completions FOR DELETE TO authenticated
 USING (public.can_manage_schulungen());

-- Reine Genehmiger-Prüfung wird bereits von is_genehmiger() (Paket 5) bereitgestellt.

CREATE OR REPLACE FUNCTION public.can_self_register_schulung(p_session_id uuid)
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
  IF NOT public.has_portal_area_access('schulungen') THEN
    RETURN false;
  END IF;

  SELECT s.announced, s.capacity, s.module_id INTO v_announced, v_capacity, v_module
  FROM public.schulungen_sessions s WHERE s.id = p_session_id;

  IF v_module IS NULL OR v_announced IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schulungen_completions c
    WHERE c.officer_id = auth.uid() AND c.module_id = v_module
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schulungen_registrations r
    WHERE r.session_id = p_session_id AND r.officer_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.schulungen_assignments a
    WHERE a.session_id = p_session_id AND a.officer_id = auth.uid() AND a.status = 'vorschlag'
  ) THEN
    RETURN false;
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.schulungen_registrations r WHERE r.session_id = p_session_id;
    IF v_count >= v_capacity THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.can_self_register_schulung(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_self_register_schulung(uuid) TO authenticated;

-- Kapazität gilt unabhängig vom Schreibweg (Trigger greift auch beim
-- SECURITY-DEFINER-Insert der Entscheidungs-RPC unten), analog zu
-- enforce_einsatz_training_registration.
CREATE OR REPLACE FUNCTION public.enforce_schulungen_registration()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_count integer;
BEGIN
  SELECT capacity INTO v_capacity FROM public.schulungen_sessions WHERE id = NEW.session_id;
  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.schulungen_registrations
    WHERE session_id = NEW.session_id AND id IS DISTINCT FROM NEW.id;
    IF v_count >= v_capacity THEN
      RAISE EXCEPTION 'Keine freien Plätze mehr';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schulungen_registration_enforce ON public.schulungen_registrations;
CREATE TRIGGER schulungen_registration_enforce
  BEFORE INSERT OR UPDATE ON public.schulungen_registrations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_schulungen_registration();

REVOKE ALL ON FUNCTION public.enforce_schulungen_registration() FROM PUBLIC, anon;

-- Anmeldungen entstehen ausschließlich über die Entscheidungs-RPC unten
-- (SECURITY DEFINER, siehe dort) oder direkt durch den Genehmiger; Sachbe-
-- arbeiter/Beamte können nur einen Vorschlag (schulungen_assignments)
-- anlegen. Abmelden (Tracking) bleibt Sachbearbeiter-/Selbstaufgabe.
CREATE POLICY "Schulungen-Anmeldungen lesen" ON public.schulungen_registrations FOR SELECT TO authenticated
 USING (public.can_manage_schulungen() OR officer_id = (SELECT auth.uid()));
CREATE POLICY "Schulungen-Anmeldungen anlegen" ON public.schulungen_registrations FOR INSERT TO authenticated
 WITH CHECK (public.is_genehmiger());
CREATE POLICY "Schulungen-Anmeldungen löschen" ON public.schulungen_registrations FOR DELETE TO authenticated
 USING (public.can_manage_schulungen() OR officer_id = (SELECT auth.uid()));

CREATE POLICY "Schulungsvorschläge lesen" ON public.schulungen_assignments FOR SELECT TO authenticated
 USING (public.can_manage_schulungen() OR officer_id = (SELECT auth.uid()));
CREATE POLICY "Schulungsvorschläge anlegen" ON public.schulungen_assignments FOR INSERT TO authenticated
 WITH CHECK (
   status = 'vorschlag' AND decided_by IS NULL AND decided_at IS NULL AND proposed_by = (SELECT auth.uid())
   AND (
     public.can_manage_schulungen()
     OR (officer_id = (SELECT auth.uid()) AND session_id IS NOT NULL AND public.can_self_register_schulung(session_id))
   )
 );
CREATE POLICY "Schulungsvorschläge zurückziehen" ON public.schulungen_assignments FOR DELETE TO authenticated
 USING (status = 'vorschlag' AND (proposed_by = (SELECT auth.uid()) OR public.can_manage_schulungen()));

CREATE OR REPLACE FUNCTION public.decide_schulung_assignment(
  p_assignment_id uuid,
  p_approve boolean,
  p_session_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.schulungen_assignments%ROWTYPE;
  v_session_id uuid;
  v_registration_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_genehmiger() THEN
    RAISE EXCEPTION 'Nicht berechtigt';
  END IF;

  SELECT * INTO v_assignment FROM public.schulungen_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.status <> 'vorschlag' THEN
    RAISE EXCEPTION 'Vorschlag ist nicht mehr offen';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.schulungen_assignments
    SET status = 'abgelehnt', decided_by = auth.uid(), decided_at = now(), note = nullif(trim(coalesce(p_note, '')), '')
    WHERE id = p_assignment_id;
    RETURN NULL;
  END IF;

  v_session_id := coalesce(p_session_id, v_assignment.session_id);
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Termin auswählen';
  END IF;

  INSERT INTO public.schulungen_registrations (session_id, officer_id)
  VALUES (v_session_id, v_assignment.officer_id)
  ON CONFLICT (session_id, officer_id) DO NOTHING
  RETURNING id INTO v_registration_id;

  IF v_registration_id IS NULL THEN
    SELECT id INTO v_registration_id FROM public.schulungen_registrations
    WHERE session_id = v_session_id AND officer_id = v_assignment.officer_id;
  END IF;

  UPDATE public.schulungen_assignments
  SET status = 'eingeteilt', session_id = v_session_id, decided_by = auth.uid(), decided_at = now(),
      note = nullif(trim(coalesce(p_note, '')), '')
  WHERE id = p_assignment_id;

  RETURN v_registration_id;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_schulung_assignment(uuid, boolean, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_schulung_assignment(uuid, boolean, uuid, text) TO authenticated;
