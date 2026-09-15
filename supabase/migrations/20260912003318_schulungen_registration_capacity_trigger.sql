-- Kapazität gilt unabhängig vom Schreibweg (Trigger greift auch beim
-- SECURITY-DEFINER-Insert der Entscheidungs-RPC), analog zu
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
