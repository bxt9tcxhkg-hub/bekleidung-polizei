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
  IF (von_default AT TIME ZONE 'Europe/Vienna') <> von THEN
    RAISE EXCEPTION 'Die Uhrzeit % existiert am Tag der Sommerzeit-Umstellung nicht (Wanduhr springt von 02:00 auf 03:00).', to_char(von, 'DD.MM.YYYY HH24:MI');
  END IF;
  IF (bis_default AT TIME ZONE 'Europe/Vienna') <> bis THEN
    RAISE EXCEPTION 'Die Uhrzeit % existiert am Tag der Sommerzeit-Umstellung nicht (Wanduhr springt von 02:00 auf 03:00).', to_char(bis, 'DD.MM.YYYY HH24:MI');
  END IF;

  IF von_ambiguous AND bis_ambiguous THEN
    von_instant := von_default;
    bis_instant := bis_default;
  ELSE
    von_instant := CASE WHEN von_ambiguous THEN von_earlier ELSE von_default END;
    bis_instant := bis_default;
  END IF;
  RETURN EXTRACT(EPOCH FROM (bis_instant - von_instant)) / 3600.0;
END;
$$;
