-- Reaktion auf drei weitere Review-Findings:
--
-- 1. created_at bestimmt die Reihenfolge der Feiertags-Zuteilung (siehe
--    20261111_ueberstunden_faire_reallokation.sql), war bisher aber weder
--    beim Anlegen noch bei einer Änderung serverseitig geschützt - ein API-
--    Aufruf hätte einen beliebigen Wert mitschicken bzw. nachträglich ändern
--    können, um sich in der Zuteilung "vorzudrängen" (die Reallokation
--    reagiert nur auf Zeitraum-/Status-Änderungen, nicht auf created_at).
--    Fix: created_at wird jetzt im selben Trigger, der auch std_* berechnet,
--    unveränderlich serverseitig gesetzt (bei INSERT auf now(), bei UPDATE
--    unangetastet).
-- 2. Das step=900-Attribut auf den Uhrzeit-Feldern ist nur ein Browser-Hinweis
--    (die Maske wird nicht als natives Formular abgeschickt) - ein Wert wie
--    18:55 ließ sich weiterhin eintippen und speichern, was die Annahme
--    "Eingabezeiten liegen immer auf dem Viertelstunden-Raster" (Grundlage
--    für die rundungsfreie Kategorisierung) wieder aushebeln konnte. Fix:
--    ein DB-CHECK erzwingt das Raster jetzt unabhängig vom Client.
-- 3. ueberstunden_berechne_aufschluesselung war als STABLE deklariert - die
--    interne Abfrage der "bereits verwendeten" Stunden teilt sich dadurch
--    den Snapshot der aufrufenden Anweisung und sieht daher auch NACH dem
--    Warten auf den Advisory Lock (also nachdem die konkurrierende
--    Transaktion committet hat) noch nicht deren neue Zeile - der Lock
--    serialisiert zwar die Ausführung, verhindert aber nicht das veraltete
--    Snapshot. Als VOLATILE (Standard) bekommt jede interne Anweisung der
--    Funktion einen frischen Snapshot, insbesondere die Abfrage NACH dem
--    Lock - genau das wird hier gebraucht.

ALTER TABLE public.ueberstunden_meldungen
  ADD CONSTRAINT ueberstunden_meldungen_von_zeit_raster CHECK (EXTRACT(MINUTE FROM von_zeit)::int % 15 = 0 AND EXTRACT(SECOND FROM von_zeit) = 0),
  ADD CONSTRAINT ueberstunden_meldungen_bis_zeit_raster CHECK (EXTRACT(MINUTE FROM bis_zeit)::int % 15 = 0 AND EXTRACT(SECOND FROM bis_zeit) = 0);

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
    dauer := EXTRACT(EPOCH FROM ((ende AT TIME ZONE 'Europe/Vienna') - (cur AT TIME ZONE 'Europe/Vienna'))) / 3600.0;

    IF public.ist_sonn_oder_feiertag(tagesbeginn::date) THEN
      -- Der Lock wird als eigene Anweisung VOR der Abfrage unten erworben;
      -- weil die Funktion (jetzt) VOLATILE ist, bekommt die nachfolgende
      -- Abfrage einen frischen, den Lock-Erwerb berücksichtigenden Snapshot.
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
        AND (m.created_at, m.id) < (p_created_at, p_exclude_id);

      verbleibend := GREATEST(8 - bereits_verwendet, 0);
      diese := LEAST(dauer, verbleibend);
      s100 := s100 + diese;
      s200 := s200 + (dauer - diese);
    ELSE
      ol_start := GREATEST(cur, tagesbeginn);
      ol_ende := LEAST(ende, tagesbeginn + interval '6 hour');
      IF ol_ende > ol_start THEN s2206 := s2206 + EXTRACT(EPOCH FROM ((ol_ende AT TIME ZONE 'Europe/Vienna') - (ol_start AT TIME ZONE 'Europe/Vienna'))) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '6 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '19 hour');
      IF ol_ende > ol_start THEN w50 := w50 + EXTRACT(EPOCH FROM ((ol_ende AT TIME ZONE 'Europe/Vienna') - (ol_start AT TIME ZONE 'Europe/Vienna'))) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '19 hour');
      ol_ende := LEAST(ende, tagesbeginn + interval '22 hour');
      IF ol_ende > ol_start THEN s1922 := s1922 + EXTRACT(EPOCH FROM ((ol_ende AT TIME ZONE 'Europe/Vienna') - (ol_start AT TIME ZONE 'Europe/Vienna'))) / 3600.0; END IF;
      ol_start := GREATEST(cur, tagesbeginn + interval '22 hour');
      ol_ende := LEAST(ende, naechster_tag);
      IF ol_ende > ol_start THEN s2206 := s2206 + EXTRACT(EPOCH FROM ((ol_ende AT TIME ZONE 'Europe/Vienna') - (ol_start AT TIME ZONE 'Europe/Vienna'))) / 3600.0; END IF;
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
  -- created_at ist Grundlage der Zuteilungsreihenfolge (siehe Migration
  -- 20261111) und darf daher nicht client-steuerbar sein: bei INSERT immer
  -- auf den tatsächlichen Einfüge-Zeitpunkt setzen, bei UPDATE unverändert
  -- vom bestehenden Wert übernehmen (unabhängig davon, was mitgeschickt wurde).
  -- Bewusst clock_timestamp() statt now(): now() liefert innerhalb EINER
  -- Transaktion immer denselben Wert (Transaktionsstart) - mehrere in
  -- derselben Transaktion eingefügte Meldungen hätten damit identisches
  -- created_at und die Reihenfolge würde vom Zufall der id abhängen.
  -- clock_timestamp() liefert dagegen die tatsächliche Uhrzeit je Zeile.
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := clock_timestamp();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;

  SELECT a.std_werktag_50, a.std_sonn_100, a.std_19_22, a.std_22_06, a.std_sonn_200
    INTO NEW.std_werktag_50, NEW.std_sonn_100, NEW.std_19_22, NEW.std_22_06, NEW.std_sonn_200
  FROM public.ueberstunden_berechne_aufschluesselung(
    NEW.beamter_id, (NEW.von_datum + NEW.von_zeit)::timestamp, (NEW.bis_datum + NEW.bis_zeit)::timestamp, NEW.id, NEW.created_at
  ) a;
  RETURN NEW;
END;
$$;
