-- Reaktion auf zwei Review-Findings zu 20261107_ueberstunden_zeitraum_und_
-- auto_aufschluesselung.sql:
--
-- 1. Die Lohnarten-Aufschlüsselung (std_werktag_50/std_sonn_100/std_19_22/
--    std_22_06/std_sonn_200) wurde bisher ausschließlich im Frontend
--    berechnet (lib/ueberstunden.ts) und roh mitgeschickt - RLS erlaubt der
--    eigenen Meldung aber beliebige Werte in diesen Spalten, ein direkter
--    API-Aufruf (nicht über das React-Formular) könnte also Lohnarten
--    eintragen, die nicht zum gemeldeten Zeitraum passen. Fix: ein
--    BEFORE INSERT/UPDATE-Trigger berechnet die Aufschlüsselung serverseitig
--    aus von_datum/von_zeit/bis_datum/bis_zeit neu und überschreibt damit
--    jeden client-seitig mitgeschickten Wert (SQL-Nachbau der Logik aus
--    lib/ueberstunden.ts::berechneAufschluesselung).
-- 2. Die 8-Stunden-Schwelle (100 % vs. 200 %) an einem Sonn-/Feiertag muss
--    tagesweise je Beamten gelten, nicht pro einzelner Meldung neu bei 0
--    beginnen - sonst könnten mehrere Meldungen desselben Tages die
--    Schwelle mehrfach ausnutzen. Die serverseitige Berechnung zieht daher
--    für jeden betroffenen Kalendertag die an anderen (nicht abgelehnten)
--    Meldungen desselben Beamten für diesen Tag bereits verbrauchten
--    Stunden ab, bevor sie den 200-%-Rest für die aktuelle Meldung bestimmt.
--
-- Bewusst nur bei einer Änderung des Zeitraums neu berechnet (siehe
-- ueberstunden_autofill_std unten) - eine reine Genehmiger-Entscheidung
-- (genehmigt/abgelehnt/Rückfrage, ohne Änderung an von/bis) lässt die
-- bereits gespeicherten Werte unangetastet, damit eine Entscheidung nicht
-- rückwirkend durch inzwischen hinzugekommene andere Meldungen abweicht.

-- Österreichische (bundesweite) Feiertage - SQL-Nachbau von
-- lib/austrianHolidays.ts (Gauß'sche Osterformel).
CREATE OR REPLACE FUNCTION public.oster_sonntag(jahr int) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  WITH k AS (
    SELECT jahr AS y, jahr % 19 AS a, jahr / 100 AS b, jahr % 100 AS c
  ), k2 AS (
    SELECT *, b / 4 AS d, b % 4 AS e, (b + 8) / 25 AS f FROM k
  ), k3 AS (
    SELECT *, (b - f + 1) / 3 AS g FROM k2
  ), k4 AS (
    SELECT *, (19*a + b - d - g + 15) % 30 AS h FROM k3
  ), k5 AS (
    SELECT *, c/4 AS i, c%4 AS kk FROM k4
  ), k6 AS (
    SELECT *, (32 + 2*e + 2*i - h - kk) % 7 AS l FROM k5
  ), k7 AS (
    SELECT *, (a + 11*h + 22*l) / 451 AS m FROM k6
  ), k8 AS (
    SELECT *, (h + l - 7*m + 114) / 31 AS month, (h + l - 7*m + 114) % 31 + 1 AS day FROM k7
  )
  SELECT make_date(y, month, day) FROM k8;
$$;

CREATE OR REPLACE FUNCTION public.ist_oesterreichischer_feiertag(tag date) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT tag IN (
    make_date(extract(year from tag)::int, 1, 1),   -- Neujahr
    make_date(extract(year from tag)::int, 1, 6),   -- Heilige Drei Könige
    public.oster_sonntag(extract(year from tag)::int) + 1,  -- Ostermontag
    make_date(extract(year from tag)::int, 5, 1),   -- Staatsfeiertag
    public.oster_sonntag(extract(year from tag)::int) + 39, -- Christi Himmelfahrt
    public.oster_sonntag(extract(year from tag)::int) + 50, -- Pfingstmontag
    public.oster_sonntag(extract(year from tag)::int) + 60, -- Fronleichnam
    make_date(extract(year from tag)::int, 8, 15),  -- Mariä Himmelfahrt
    make_date(extract(year from tag)::int, 10, 26), -- Nationalfeiertag
    make_date(extract(year from tag)::int, 11, 1),  -- Allerheiligen
    make_date(extract(year from tag)::int, 12, 8),  -- Mariä Empfängnis
    make_date(extract(year from tag)::int, 12, 25), -- Christtag
    make_date(extract(year from tag)::int, 12, 26)  -- Stefanitag
  );
$$;

CREATE OR REPLACE FUNCTION public.ist_sonn_oder_feiertag(tag date) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT extract(dow from tag) = 0 OR public.ist_oesterreichischer_feiertag(tag);
$$;

-- Zerlegt [von, bis) tageweise und liefert je Kalendertag die (noch nicht
-- nach Lohnart aufgeschlüsselte) Gesamtstundenzahl - Grundlage, um für einen
-- Sonn-/Feiertag zu ermitteln, wie viele Stunden an diesem Tag bereits durch
-- ANDERE Meldungen desselben Beamten verbraucht wurden.
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
    stunden := EXTRACT(EPOCH FROM (ende - cur)) / 3600.0;
    RETURN NEXT;
    cur := ende;
  END LOOP;
END;
$$;

-- SQL-Nachbau von lib/ueberstunden.ts::berechneAufschluesselung, zusätzlich
-- mit tagesweiter 8-Std-Schwelle über alle Meldungen des Beamten hinweg
-- (p_exclude_id blendet die eigene - beim UPDATE noch mit den alten Werten
-- im Snapshot sichtbare - Zeile aus).
CREATE OR REPLACE FUNCTION public.ueberstunden_berechne_aufschluesselung(
  p_beamter_id uuid, p_von timestamp, p_bis timestamp, p_exclude_id uuid
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
      SELECT COALESCE(SUM(th.stunden), 0) INTO bereits_verwendet
      FROM public.ueberstunden_meldungen m
      CROSS JOIN LATERAL public.ueberstunden_tagesstunden(
        (m.von_datum + m.von_zeit)::timestamp, (m.bis_datum + m.bis_zeit)::timestamp
      ) th
      WHERE m.beamter_id = p_beamter_id
        AND m.status <> 'abgelehnt'
        AND (p_exclude_id IS NULL OR m.id <> p_exclude_id)
        AND th.tag = tagesbeginn::date;

      verbleibend := GREATEST(8 - bereits_verwendet, 0);
      diese := LEAST(dauer, verbleibend);
      s100 := s100 + diese;
      s200 := s200 + (dauer - diese);
    ELSE
      -- 22:00-06:00 (Anteil 00:00-06:00 des laufenden Tages)
      ol_start := GREATEST(cur, tagesbeginn);
      ol_ende := LEAST(ende, tagesbeginn + interval '6 hour');
      IF ol_ende > ol_start THEN s2206 := s2206 + EXTRACT(EPOCH FROM (ol_ende - ol_start)) / 3600.0; END IF;
      -- 06:00-19:00
      ol_start := GREATEST(cur, tagesbeginn + interval '6 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '19 hour');
      IF ol_ende > ol_start THEN w50 := w50 + EXTRACT(EPOCH FROM (ol_ende - ol_start)) / 3600.0; END IF;
      -- 19:00-22:00
      ol_start := GREATEST(cur, tagesbeginn + interval '19 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '22 hour');
      IF ol_ende > ol_start THEN s1922 := s1922 + EXTRACT(EPOCH FROM (ol_ende - ol_start)) / 3600.0; END IF;
      -- 22:00-24:00 (Anteil des laufenden Tages)
      ol_start := GREATEST(cur, tagesbeginn + interval '22 hour');
      ol_ende := LEAST(ende, naechster_tag);
      IF ol_ende > ol_start THEN s2206 := s2206 + EXTRACT(EPOCH FROM (ol_ende - ol_start)) / 3600.0; END IF;
    END IF;

    cur := ende;
  END LOOP;

  -- Auf Viertelstunden runden - wie bei der Lohnverrechnung üblich (und wie
  -- im Frontend). Da die Zeit-Inputs im Formular ebenfalls auf 15-Minuten-
  -- Schritte begrenzt sind, liegen alle Fenstergrenzen und Eingabezeiten auf
  -- demselben Raster - die Rundung je Kategorie ist damit ein No-Op und
  -- verfälscht nicht die Gesamtdauer.
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
  IF TG_OP = 'UPDATE'
     AND NEW.von_datum IS NOT DISTINCT FROM OLD.von_datum
     AND NEW.von_zeit IS NOT DISTINCT FROM OLD.von_zeit
     AND NEW.bis_datum IS NOT DISTINCT FROM OLD.bis_datum
     AND NEW.bis_zeit IS NOT DISTINCT FROM OLD.bis_zeit
  THEN
    -- Zeitraum unverändert (z. B. reine Genehmiger-Entscheidung) - Werte
    -- unangetastet lassen, statt sie durch inzwischen hinzugekommene andere
    -- Meldungen rückwirkend zu verschieben.
    RETURN NEW;
  END IF;

  SELECT a.std_werktag_50, a.std_sonn_100, a.std_19_22, a.std_22_06, a.std_sonn_200
    INTO NEW.std_werktag_50, NEW.std_sonn_100, NEW.std_19_22, NEW.std_22_06, NEW.std_sonn_200
  FROM public.ueberstunden_berechne_aufschluesselung(
    NEW.beamter_id, (NEW.von_datum + NEW.von_zeit)::timestamp, (NEW.bis_datum + NEW.bis_zeit)::timestamp, NEW.id
  ) a;
  RETURN NEW;
END;
$$;

-- Name bewusst so gewählt, dass er alphabetisch VOR
-- ueberstunden_meldungen_update_check feuert (Ausführungsreihenfolge
-- mehrerer BEFORE-Trigger = alphabetisch nach Triggername) - erst die
-- Werte serverseitig neu berechnen, danach die Berechtigungsprüfung.
CREATE TRIGGER ueberstunden_meldungen_autofill_std
  BEFORE INSERT OR UPDATE ON public.ueberstunden_meldungen
  FOR EACH ROW EXECUTE FUNCTION public.ueberstunden_autofill_std();

REVOKE ALL ON FUNCTION public.oster_sonntag(int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ist_oesterreichischer_feiertag(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ist_sonn_oder_feiertag(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ueberstunden_tagesstunden(timestamp, timestamp) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ueberstunden_berechne_aufschluesselung(uuid, timestamp, timestamp, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oster_sonntag(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ist_oesterreichischer_feiertag(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ist_sonn_oder_feiertag(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ueberstunden_tagesstunden(timestamp, timestamp) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ueberstunden_berechne_aufschluesselung(uuid, timestamp, timestamp, uuid) TO authenticated;
