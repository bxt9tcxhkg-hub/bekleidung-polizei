ALTER TABLE public.ueberstunden_meldungen
  ADD COLUMN verguetung text NOT NULL DEFAULT 'auszahlung'
    CHECK (verguetung IN ('auszahlung', 'stundenersatz'));

ALTER TABLE public.ueberstunden_meldungen DROP CONSTRAINT ueberstunden_meldungen_status_check;
ALTER TABLE public.ueberstunden_meldungen ADD CONSTRAINT ueberstunden_meldungen_status_check
  CHECK (status IN ('entwurf', 'eingereicht', 'genehmigt', 'abgelehnt', 'rueckfrage'));

CREATE OR REPLACE FUNCTION public.enforce_ueberstunden_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF public.is_genehmiger() AND NEW.beamter_id <> (SELECT auth.uid()) THEN
    IF OLD.status <> 'eingereicht' THEN
      RAISE EXCEPTION 'Nur eine eingereichte Meldung kann entschieden werden.';
    END IF;
    IF NEW.status NOT IN ('genehmigt','abgelehnt','rueckfrage') THEN
      RAISE EXCEPTION 'Der Genehmiger kann eine Meldung nur genehmigen, ablehnen oder zur Rückfrage zurücklegen.';
    END IF;
    IF NEW.beamter_id IS DISTINCT FROM OLD.beamter_id
      OR NEW.verguetung IS DISTINCT FROM OLD.verguetung
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
    IF OLD.status NOT IN ('entwurf','eingereicht','rueckfrage') THEN
      RAISE EXCEPTION 'Eine bereits entschiedene Meldung kann nicht mehr geändert werden.';
    END IF;
    IF NEW.status NOT IN ('entwurf','eingereicht') THEN
      RAISE EXCEPTION 'Der Status kann nur vom Genehmiger auf genehmigt/abgelehnt/Rückfrage gesetzt werden.';
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
