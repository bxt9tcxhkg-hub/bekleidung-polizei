CREATE OR REPLACE FUNCTION public.ueberstunden_vienna_instant(ts timestamp, prefer_earlier boolean)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  default_instant timestamptz := ts AT TIME ZONE 'Europe/Vienna';
  earlier_instant timestamptz := default_instant - interval '1 hour';
BEGIN
  IF prefer_earlier AND (earlier_instant AT TIME ZONE 'Europe/Vienna') = ts THEN
    RETURN earlier_instant;
  END IF;
  RETURN default_instant;
END;
$$;
REVOKE ALL ON FUNCTION public.ueberstunden_vienna_instant(timestamp, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ueberstunden_vienna_instant(timestamp, boolean) TO authenticated;

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
    stunden := EXTRACT(EPOCH FROM (public.ueberstunden_vienna_instant(ende, false) - public.ueberstunden_vienna_instant(cur, true))) / 3600.0;
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
    dauer := EXTRACT(EPOCH FROM (public.ueberstunden_vienna_instant(ende, false) - public.ueberstunden_vienna_instant(cur, true))) / 3600.0;

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
      IF ol_ende > ol_start THEN s2206 := s2206 + EXTRACT(EPOCH FROM (public.ueberstunden_vienna_instant(ol_ende, false) - public.ueberstunden_vienna_instant(ol_start, true))) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '6 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '19 hour');
      IF ol_ende > ol_start THEN w50 := w50 + EXTRACT(EPOCH FROM (public.ueberstunden_vienna_instant(ol_ende, false) - public.ueberstunden_vienna_instant(ol_start, true))) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '19 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '22 hour');
      IF ol_ende > ol_start THEN s1922 := s1922 + EXTRACT(EPOCH FROM (public.ueberstunden_vienna_instant(ol_ende, false) - public.ueberstunden_vienna_instant(ol_start, true))) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '22 hour');
      ol_ende := LEAST(ende, naechster_tag);
      IF ol_ende > ol_start THEN s2206 := s2206 + EXTRACT(EPOCH FROM (public.ueberstunden_vienna_instant(ol_ende, false) - public.ueberstunden_vienna_instant(ol_start, true))) / 3600.0; END IF;
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
