CREATE OR REPLACE FUNCTION public.ueberstunden_berechne_aufschluesselung(
  p_beamter_id uuid, p_von timestamp, p_bis timestamp, p_exclude_id uuid, p_created_at timestamptz
) RETURNS TABLE(std_werktag_50 numeric, std_sonn_100 numeric, std_19_22 numeric, std_22_06 numeric, std_sonn_200 numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  cur timestamp := p_von;
  tagesbeginn timestamp;
  naechster_tag timestamp;
  ende timestamp;
  dauer numeric;
  bereits_verwendet numeric;
  verbleibend numeric;
  diese numeric;
  w50 numeric := 0; s100 numeric := 0; s1922 numeric := 0; s2206 numeric := 0; s200 numeric := 0;
  ol_start timestamp; ol_ende timestamp;
BEGIN
  IF p_von IS NULL OR p_bis IS NULL OR p_bis <= p_von THEN
    std_werktag_50 := 0; std_sonn_100 := 0; std_19_22 := 0; std_22_06 := 0; std_sonn_200 := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  WHILE cur < p_bis LOOP
    tagesbeginn := date_trunc('day', cur);
    naechster_tag := tagesbeginn + interval '1 day';
    ende := LEAST(p_bis, naechster_tag);
    dauer := EXTRACT(EPOCH FROM (ende - cur)) / 3600.0;

    IF public.ist_sonn_oder_feiertag(tagesbeginn::date) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_beamter_id::text || ':' || (tagesbeginn::date)::text, 0));

      SELECT COALESCE(SUM(th.stunden), 0) INTO bereits_verwendet
      FROM public.ueberstunden_meldungen m
      CROSS JOIN LATERAL public.ueberstunden_tagesstunden(
        (m.von_datum + m.von_zeit)::timestamp, (m.bis_datum + m.bis_zeit)::timestamp
      ) th
      WHERE m.beamter_id = p_beamter_id
        AND m.status <> 'abgelehnt'
        AND (p_exclude_id IS NULL OR m.id <> p_exclude_id)
        AND th.tag = tagesbeginn::date
        AND (m.created_at, m.id) < (p_created_at, p_exclude_id);

      verbleibend := GREATEST(8 - bereits_verwendet, 0);
      diese := LEAST(dauer, verbleibend);
      s100 := s100 + diese;
      s200 := s200 + (dauer - diese);
    ELSE
      ol_start := GREATEST(cur, tagesbeginn);
      ol_ende := LEAST(ende, tagesbeginn + interval '6 hour');
      IF ol_ende > ol_start THEN s2206 := s2206 + EXTRACT(EPOCH FROM (ol_ende - ol_start)) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '6 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '19 hour');
      IF ol_ende > ol_start THEN w50 := w50 + EXTRACT(EPOCH FROM (ol_ende - ol_start)) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '19 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '22 hour');
      IF ol_ende > ol_start THEN s1922 := s1922 + EXTRACT(EPOCH FROM (ol_ende - ol_start)) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '22 hour');
      ol_ende := LEAST(ende, naechster_tag);
      IF ol_ende > ol_start THEN s2206 := s2206 + EXTRACT(EPOCH FROM (ol_ende - ol_start)) / 3600.0; END IF;
    END IF;

    cur := ende;
  END LOOP;

  std_werktag_50 := round(w50 * 4) / 4;
  std_sonn_100 := round(s100 * 4) / 4;
  std_19_22 := round(s1922 * 4) / 4;
  std_22_06 := round(s2206 * 4) / 4;
  std_sonn_200 := round(s200 * 4) / 4;
  RETURN NEXT;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.ueberstunden_autofill_std() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  SELECT a.std_werktag_50, a.std_sonn_100, a.std_19_22, a.std_22_06, a.std_sonn_200
    INTO NEW.std_werktag_50, NEW.std_sonn_100, NEW.std_19_22, NEW.std_22_06, NEW.std_sonn_200
  FROM public.ueberstunden_berechne_aufschluesselung(
    NEW.beamter_id, (NEW.von_datum + NEW.von_zeit)::timestamp, (NEW.bis_datum + NEW.bis_zeit)::timestamp, NEW.id, NEW.created_at
  ) a;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_ueberstunden_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF current_setting('ueberstunden.recompute_cascade', true) = 'on' THEN
    RETURN NEW;
  END IF;

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
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.eingereicht_at IS DISTINCT FROM OLD.eingereicht_at
    THEN
      RAISE EXCEPTION 'Der Genehmiger kann nur über die Meldung entscheiden, nicht ihre Angaben ändern.';
    END IF;
  ELSE
    IF OLD.status NOT IN ('entwurf','eingereicht','rueckfrage') THEN
      RAISE EXCEPTION 'Eine bereits entschiedene Meldung kann nicht mehr geändert werden.';
    END IF;
    IF NEW.status NOT IN ('entwurf','eingereicht') AND NOT (OLD.status = 'rueckfrage' AND NEW.status = 'rueckfrage') THEN
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

CREATE OR REPLACE FUNCTION public.ueberstunden_reallocate_nachfolgende(p_beamter_id uuid, p_tag date, p_created_at timestamptz, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM set_config('ueberstunden.recompute_cascade', 'on', true);
  UPDATE public.ueberstunden_meldungen m
  SET updated_at = now()
  WHERE m.beamter_id = p_beamter_id
    AND m.status <> 'abgelehnt'
    AND (m.created_at, m.id) > (p_created_at, p_id)
    AND EXISTS (
      SELECT 1 FROM public.ueberstunden_tagesstunden((m.von_datum + m.von_zeit)::timestamp, (m.bis_datum + m.bis_zeit)::timestamp) th
      WHERE th.tag = p_tag
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.ueberstunden_nach_aenderung() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  tagrow record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'abgelehnt' THEN
      FOR tagrow IN
        SELECT th.tag FROM public.ueberstunden_tagesstunden((OLD.von_datum + OLD.von_zeit)::timestamp, (OLD.bis_datum + OLD.bis_zeit)::timestamp) th
        WHERE public.ist_sonn_oder_feiertag(th.tag)
      LOOP
        PERFORM public.ueberstunden_reallocate_nachfolgende(OLD.beamter_id, tagrow.tag, OLD.created_at, OLD.id);
      END LOOP;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.von_datum IS DISTINCT FROM OLD.von_datum OR NEW.von_zeit IS DISTINCT FROM OLD.von_zeit
     OR NEW.bis_datum IS DISTINCT FROM OLD.bis_datum OR NEW.bis_zeit IS DISTINCT FROM OLD.bis_zeit
     OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF OLD.status <> 'abgelehnt' THEN
      FOR tagrow IN
        SELECT th.tag FROM public.ueberstunden_tagesstunden((OLD.von_datum + OLD.von_zeit)::timestamp, (OLD.bis_datum + OLD.bis_zeit)::timestamp) th
        WHERE public.ist_sonn_oder_feiertag(th.tag)
      LOOP
        PERFORM public.ueberstunden_reallocate_nachfolgende(NEW.beamter_id, tagrow.tag, NEW.created_at, NEW.id);
      END LOOP;
    END IF;
    IF NEW.status <> 'abgelehnt' THEN
      FOR tagrow IN
        SELECT th.tag FROM public.ueberstunden_tagesstunden((NEW.von_datum + NEW.von_zeit)::timestamp, (NEW.bis_datum + NEW.bis_zeit)::timestamp) th
        WHERE public.ist_sonn_oder_feiertag(th.tag)
      LOOP
        PERFORM public.ueberstunden_reallocate_nachfolgende(NEW.beamter_id, tagrow.tag, NEW.created_at, NEW.id);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ueberstunden_meldungen_reallocate
  AFTER UPDATE OR DELETE ON public.ueberstunden_meldungen
  FOR EACH ROW EXECUTE FUNCTION public.ueberstunden_nach_aenderung();

DROP FUNCTION IF EXISTS public.ueberstunden_berechne_aufschluesselung(uuid, timestamp, timestamp, uuid);
REVOKE ALL ON FUNCTION public.ueberstunden_berechne_aufschluesselung(uuid, timestamp, timestamp, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ueberstunden_reallocate_nachfolgende(uuid, date, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ueberstunden_berechne_aufschluesselung(uuid, timestamp, timestamp, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ueberstunden_reallocate_nachfolgende(uuid, date, timestamptz, uuid) TO authenticated;
