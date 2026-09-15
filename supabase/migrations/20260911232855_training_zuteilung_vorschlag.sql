CREATE OR REPLACE FUNCTION public.is_genehmiger()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT public.has_role('admin') OR public.has_role('genehmiger') OR public.has_role('approver');
$function$;

CREATE TABLE public.einsatz_training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.profiles(id),
  module_id uuid NOT NULL REFERENCES public.einsatz_training_modules(id),
  session_id uuid REFERENCES public.einsatz_training_sessions(id),
  status text NOT NULL DEFAULT 'vorschlag' CHECK (status IN ('vorschlag','eingeteilt','abgelehnt')),
  proposed_by uuid NOT NULL REFERENCES public.profiles(id),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES public.profiles(id),
  decided_at timestamptz,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX einsatz_training_assignments_officer_idx ON public.einsatz_training_assignments(officer_id);
CREATE INDEX einsatz_training_assignments_module_idx ON public.einsatz_training_assignments(module_id);
CREATE INDEX einsatz_training_assignments_status_idx ON public.einsatz_training_assignments(status) WHERE status = 'vorschlag';

DROP TRIGGER IF EXISTS einsatz_training_assignments_updated_at ON public.einsatz_training_assignments;
CREATE TRIGGER einsatz_training_assignments_updated_at
  BEFORE UPDATE ON public.einsatz_training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.einsatz_training_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.einsatz_training_assignments FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.einsatz_training_assignments TO authenticated;

CREATE POLICY "Trainingsvorschläge lesen" ON public.einsatz_training_assignments FOR SELECT TO authenticated
 USING (public.can_manage_einsatzmittel() OR officer_id = (SELECT auth.uid()));

CREATE POLICY "Trainingsvorschläge anlegen" ON public.einsatz_training_assignments FOR INSERT TO authenticated
 WITH CHECK (
   status = 'vorschlag' AND decided_by IS NULL AND decided_at IS NULL AND proposed_by = (SELECT auth.uid())
   AND (
     public.can_manage_einsatzmittel()
     OR (officer_id = (SELECT auth.uid()) AND session_id IS NOT NULL AND public.can_self_register_einsatztraining(session_id))
   )
 );

CREATE POLICY "Trainingsvorschläge zurückziehen" ON public.einsatz_training_assignments FOR DELETE TO authenticated
 USING (status = 'vorschlag' AND (proposed_by = (SELECT auth.uid()) OR public.can_manage_einsatzmittel()));

CREATE OR REPLACE FUNCTION public.decide_training_assignment(
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
  v_assignment public.einsatz_training_assignments%ROWTYPE;
  v_session_id uuid;
  v_registration_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_genehmiger() THEN
    RAISE EXCEPTION 'Nicht berechtigt';
  END IF;

  SELECT * INTO v_assignment FROM public.einsatz_training_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.status <> 'vorschlag' THEN
    RAISE EXCEPTION 'Vorschlag ist nicht mehr offen';
  END IF;

  IF NOT p_approve THEN
    UPDATE public.einsatz_training_assignments
    SET status = 'abgelehnt', decided_by = auth.uid(), decided_at = now(), note = nullif(trim(coalesce(p_note, '')), '')
    WHERE id = p_assignment_id;
    RETURN NULL;
  END IF;

  v_session_id := coalesce(p_session_id, v_assignment.session_id);
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Termin auswählen';
  END IF;

  INSERT INTO public.einsatz_training_registrations (session_id, officer_id)
  VALUES (v_session_id, v_assignment.officer_id)
  ON CONFLICT (session_id, officer_id) DO NOTHING
  RETURNING id INTO v_registration_id;

  IF v_registration_id IS NULL THEN
    SELECT id INTO v_registration_id FROM public.einsatz_training_registrations
    WHERE session_id = v_session_id AND officer_id = v_assignment.officer_id;
  END IF;

  UPDATE public.einsatz_training_assignments
  SET status = 'eingeteilt', session_id = v_session_id, decided_by = auth.uid(), decided_at = now(),
      note = nullif(trim(coalesce(p_note, '')), '')
  WHERE id = p_assignment_id;

  RETURN v_registration_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_training_assignment(uuid, boolean, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_training_assignment(uuid, boolean, uuid, text) TO authenticated;
