-- Verstöße gegen Auflagen beziehen sich stets auf einen konkreten Bescheid
-- (Straßenmusik/Straßenkunst) – kein freistehender Verstoß ohne Bezug.

ALTER TABLE public.innendienst_records
  ADD COLUMN related_bescheid_id uuid REFERENCES public.innendienst_records(id) ON DELETE CASCADE;

ALTER TABLE public.innendienst_records
  ADD CONSTRAINT innendienst_records_verstoss_needs_bescheid
  CHECK (kind<>'verstoss' OR related_bescheid_id IS NOT NULL);

ALTER TABLE public.innendienst_records
  ADD CONSTRAINT innendienst_records_bescheid_has_no_bezug
  CHECK (kind='verstoss' OR related_bescheid_id IS NULL);

CREATE INDEX innendienst_records_related_bescheid_idx
  ON public.innendienst_records(related_bescheid_id) WHERE related_bescheid_id IS NOT NULL;

-- Der verknüpfte Datensatz muss selbst ein Bescheid sein (kein Verstoß auf einen Verstoß).
CREATE OR REPLACE FUNCTION public.check_innendienst_verstoss_target() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_kind text;
BEGIN
  IF NEW.related_bescheid_id IS NOT NULL THEN
    SELECT kind INTO v_kind FROM public.innendienst_records WHERE id=NEW.related_bescheid_id;
    IF v_kind IS NULL OR v_kind NOT IN ('bescheid_strassenmusik','bescheid_strassenkunst') THEN
      RAISE EXCEPTION 'Ein Verstoß kann nur mit einem Bescheid für Straßenmusik oder Straßenkunst verknüpft werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER innendienst_records_verstoss_target_check
  BEFORE INSERT OR UPDATE ON public.innendienst_records
  FOR EACH ROW EXECUTE FUNCTION public.check_innendienst_verstoss_target();
