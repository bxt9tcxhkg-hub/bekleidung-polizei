-- Reaktion auf ein Review-Finding (P2) zur Round-12-Korrektur: die
-- Heuristik dort löste bei einer mehrdeutigen lokalen Zeit IMMER den Beginn
-- eines Abschnitts auf die frühere (Sommerzeit-), das Ende auf die spätere
-- (Normalzeit-)Variante auf - richtig für einen Dienst, der buchstäblich
-- über die gesamte wiederholte Stunde hinweggeht (z. B. "02:00 bis 03:00"),
-- aber falsch, wenn BEIDE Endpunkte in derselben wiederholten Stunde liegen
-- (z. B. "02:15 bis 02:45"): dort ist ein kurzes Intervall INNERHALB
-- desselben Durchgangs (30 Minuten) weitaus wahrscheinlicher gemeint als ein
-- Dienst, der zwischen den beiden Durchgängen hin- und herspringt (1,5
-- Stunden) - die alte Heuristik erzwang aber immer Letzteres.
--
-- Fix: nur wenn GENAU EIN Endpunkt mehrdeutig ist (der andere eindeutig vor
-- oder nach der wiederholten Stunde liegt), wird die frühere/spätere
-- Variante wie bisher erzwungen - das deckt weiterhin den Fall "Dienst
-- beginnt/endet in der wiederholten Stunde und geht darüber hinaus". Sind
-- BEIDE Endpunkte mehrdeutig, werden beide auf denselben (von Postgres
-- standardmäßig gewählten, späteren) Durchgang aufgelöst - die naheliegende
-- Deutung eines kurzen Intervalls innerhalb eines Durchgangs.

CREATE OR REPLACE FUNCTION public.ueberstunden_vienna_diff_hours(von timestamp, bis timestamp)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  von_default timestamptz := von AT TIME ZONE 'Europe/Vienna';
  bis_default timestamptz := bis AT TIME ZONE 'Europe/Vienna';
  von_earlier timestamptz := von_default - interval '1 hour';
  von_ambiguous boolean := (von_earlier AT TIME ZONE 'Europe/Vienna') = von;
  bis_earlier timestamptz := bis_default - interval '1 hour';
  bis_ambiguous boolean := (bis_earlier AT TIME ZONE 'Europe/Vienna') = bis;
  von_instant timestamptz;
  bis_instant timestamptz;
BEGIN
  IF von_ambiguous AND bis_ambiguous THEN
    -- Beide Endpunkte in der wiederholten Stunde: beide auf denselben
    -- (späteren) Durchgang auflösen - ein kurzes Intervall innerhalb eines
    -- Durchgangs, nicht ein Sprung zwischen beiden.
    von_instant := von_default;
    bis_instant := bis_default;
  ELSE
    von_instant := CASE WHEN von_ambiguous THEN von_earlier ELSE von_default END;
    bis_instant := bis_default;
  END IF;
  RETURN EXTRACT(EPOCH FROM (bis_instant - von_instant)) / 3600.0;
END;
$$;
REVOKE ALL ON FUNCTION public.ueberstunden_vienna_diff_hours(timestamp, timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ueberstunden_vienna_diff_hours(timestamp, timestamp) TO authenticated;

DROP FUNCTION IF EXISTS public.ueberstunden_vienna_instant(timestamp, boolean);

CREATE OR REPLACE FUNCTION public.ueberstunden_tagesstunden(von timestamp, bis timestamp)
RETURNS TABLE(tag date, stunden numeric) LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  cur timestamp := von;
  tagesbeginn timestamp;
  naechster_tag timestamp;
  ende timestamp;
BEGIN
  IF von IS NULL OR bis IS NULL OR bis <= von THEN
    RETURN;
  END IF;
  WHILE cur < bis LOOP
    tagesbeginn := date_trunc('day', cur);
    naechster_tag := tagesbeginn + interval '1 day';
    ende := LEAST(bis, naechster_tag);
    tag := tagesbeginn::date;
    stunden := public.ueberstunden_vienna_diff_hours(cur, ende);
    RETURN NEXT;
    cur := ende;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ueberstunden_berechne_aufschluesselung(
  p_beamter_id uuid, p_von timestamp, p_bis timestamp, p_exclude_id uuid, p_created_at timestamptz
) RETURNS TABLE(std_werktag_50 numeric, std_sonn_100 numeric, std_19_22 numeric, std_22_06 numeric, std_sonn_200 numeric)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
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
    dauer := public.ueberstunden_vienna_diff_hours(cur, ende);

    IF public.ist_sonn_oder_feiertag(tagesbeginn::date) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(p_beamter_id::text || ':' || (tagesbeginn::date)::text, 0));

      SELECT COALESCE(SUM(th.stunden), 0) INTO bereits_verwendet
      FROM public.ueberstunden_meldungen m
      CROSS JOIN LATERAL public.ueberstunden_tagesstunden(
        (m.von_datum + m.von_zeit)::timestamp, (m.bis_datum + m.bis_zeit)::timestamp
      ) th
      WHERE m.beamter_id = p_beamter_id
        AND public.ueberstunden_zaehlt_zum_topf(m.status)
        AND (p_exclude_id IS NULL OR m.id <> p_exclude_id)
        AND th.tag = tagesbeginn::date
        AND ((m.von_datum + m.von_zeit)::timestamp, m.id) < (p_von, p_exclude_id);

      verbleibend := GREATEST(8 - bereits_verwendet, 0);
      diese := LEAST(dauer, verbleibend);
      s100 := s100 + diese;
      s200 := s200 + (dauer - diese);
    ELSE
      ol_start := GREATEST(cur, tagesbeginn);
      ol_ende := LEAST(ende, tagesbeginn + interval '6 hour');
      IF ol_ende > ol_start THEN s2206 := s2206 + public.ueberstunden_vienna_diff_hours(ol_start, ol_ende); END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '6 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '19 hour');
      IF ol_ende > ol_start THEN w50 := w50 + public.ueberstunden_vienna_diff_hours(ol_start, ol_ende); END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '19 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '22 hour');
      IF ol_ende > ol_start THEN s1922 := s1922 + public.ueberstunden_vienna_diff_hours(ol_start, ol_ende); END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '22 hour');
      ol_ende := LEAST(ende, naechster_tag);
      IF ol_ende > ol_start THEN s2206 := s2206 + public.ueberstunden_vienna_diff_hours(ol_start, ol_ende); END IF;
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
