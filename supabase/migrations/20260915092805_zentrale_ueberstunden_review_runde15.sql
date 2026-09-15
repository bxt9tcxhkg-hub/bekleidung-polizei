CREATE OR REPLACE FUNCTION public.enforce_operational_person_notes_active() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT public.can_manage_zentrale() AND NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'Nur die Verwaltung kann einen Personenhinweis (de)aktivieren.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_operational_person_notes_active() FROM PUBLIC, anon;
CREATE TRIGGER operational_person_notes_enforce_active BEFORE UPDATE ON public.operational_person_notes
FOR EACH ROW EXECUTE FUNCTION public.enforce_operational_person_notes_active();

ALTER TABLE public.ueberstunden_meldungen
  ADD CONSTRAINT ueberstunden_meldungen_zeitraum_maximal
  CHECK (((bis_datum + bis_zeit) - (von_datum + von_zeit)) <= interval '31 days');
