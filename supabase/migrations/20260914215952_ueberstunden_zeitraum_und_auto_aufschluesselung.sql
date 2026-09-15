ALTER TABLE public.ueberstunden_meldungen RENAME COLUMN datum TO von_datum;
ALTER TABLE public.ueberstunden_meldungen RENAME COLUMN zeit_von TO von_zeit;
ALTER TABLE public.ueberstunden_meldungen RENAME COLUMN zeit_bis TO bis_zeit;
ALTER TABLE public.ueberstunden_meldungen ADD COLUMN bis_datum date;
UPDATE public.ueberstunden_meldungen SET bis_datum = von_datum WHERE bis_datum IS NULL;
ALTER TABLE public.ueberstunden_meldungen ALTER COLUMN bis_datum SET NOT NULL;
ALTER TABLE public.ueberstunden_meldungen ALTER COLUMN von_zeit SET NOT NULL;
ALTER TABLE public.ueberstunden_meldungen ALTER COLUMN bis_zeit SET NOT NULL;
ALTER TABLE public.ueberstunden_meldungen ADD CONSTRAINT ueberstunden_meldungen_zeitraum_gueltig
  CHECK ((bis_datum + bis_zeit) > (von_datum + von_zeit));

CREATE OR REPLACE FUNCTION public.enforce_ueberstunden_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF public.is_genehmiger() AND NEW.beamter_id <> (SELECT auth.uid()) THEN
    IF OLD.status <> 'eingereicht' THEN
      RAISE EXCEPTION 'Nur eine eingereichte Meldung kann entschieden werden.';
    END IF;
    IF NEW.status NOT IN ('genehmigt','abgelehnt') THEN
      RAISE EXCEPTION 'Der Genehmiger kann eine Meldung nur genehmigen oder ablehnen.';
    END IF;
    IF NEW.beamter_id IS DISTINCT FROM OLD.beamter_id
      OR NEW.von_datum IS DISTINCT FROM OLD.von_datum
      OR NEW.bis_datum IS DISTINCT FROM OLD.bis_datum
      OR NEW.von_zeit IS DISTINCT FROM OLD.von_zeit
      OR NEW.bis_zeit IS DISTINCT FROM OLD.bis_zeit
      OR NEW.grund IS DISTINCT FROM OLD.grund
      OR NEW.std_werktag_50 IS DISTINCT FROM OLD.std_werktag_50
      OR NEW.std_sonn_100 IS DISTINCT FROM OLD.std_sonn_100
      OR NEW.std_19_22 IS DISTINCT FROM OLD.std_19_22
      OR NEW.std_22_06 IS DISTINCT FROM OLD.std_22_06
      OR NEW.std_sonn_200 IS DISTINCT FROM OLD.std_sonn_200
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.eingereicht_at IS DISTINCT FROM OLD.eingereicht_at
    THEN
      RAISE EXCEPTION 'Der Genehmiger kann nur über die Meldung entscheiden, nicht ihre Angaben ändern.';
    END IF;
  ELSE
    IF OLD.status NOT IN ('entwurf','eingereicht') THEN
      RAISE EXCEPTION 'Eine bereits entschiedene Meldung kann nicht mehr geändert werden.';
    END IF;
    IF NEW.status NOT IN ('entwurf','eingereicht') THEN
      RAISE EXCEPTION 'Der Status kann nur vom Genehmiger auf genehmigt/abgelehnt gesetzt werden.';
    END IF;
    IF NEW.genehmiger_id IS DISTINCT FROM OLD.genehmiger_id
      OR NEW.genehmigt_at IS DISTINCT FROM OLD.genehmigt_at
      OR NEW.genehmiger_note IS DISTINCT FROM OLD.genehmiger_note
      OR NEW.beamter_id IS DISTINCT FROM OLD.beamter_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Diese Felder können nur vom Genehmiger geändert werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
