-- Reaktion auf zwei weitere Findings zur Runde 15 (Codex-Review auf Commit 40b1062):
--
-- 1. (P1) Der CHECK ueberstunden_meldungen_zeitraum_maximal (Runde 15) wird von
--    Postgres erst NACH allen BEFORE-Triggern ausgewertet. Der BEFORE-Trigger
--    ueberstunden_meldungen_autofill_std ruft aber bereits VOR dieser Prüfung
--    ueberstunden_berechne_aufschluesselung() auf, das tageweise über den
--    Zeitraum iteriert - ein Insert/Update mit sehr weit entferntem Enddatum
--    (z. B. Jahr 9999) durchläuft also weiterhin Millionen Iterationen (inkl.
--    Datenbankabfragen pro Sonn-/Feiertag), bevor der CHECK überhaupt greift
--    und den Insert verwirft. Fix: dieselbe Obergrenze wird jetzt VOR dem
--    Aufruf von ueberstunden_berechne_aufschluesselung() direkt im Trigger
--    geprüft (RAISE EXCEPTION), sodass die teure Berechnung gar nicht erst
--    startet. Der CHECK bleibt zusätzlich als zweite Verteidigungslinie
--    bestehen.
--
-- 2. (P2) anteilFuerMonat() (lib/ueberstunden.ts, Runde 14) rekonstruierte die
--    100%/200%-Sonn-/Feiertags-Aufteilung einer monatsgrenzenübergreifenden
--    Meldung rein aus deren EIGENEN Stunden je Tag ("naiv"), ohne zu
--    berücksichtigen, dass an einem der betroffenen Tage bereits ANDERE
--    Meldungen desselben Beamten zum 8-Std.-Topf beigetragen haben - genau
--    dieser Fall wird von ueberstunden_berechne_aufschluesselung() beim
--    Speichern der Meldung selbst korrekt aufgelöst (siehe bereits_verwendet
--    in dieser Funktion), die Information geht aber verloren, sobald nur noch
--    die AGGREGIERTEN std_sonn_100/std_sonn_200 der Meldung gespeichert sind.
--    Fix: die bisherige Tages-Schleife wird in eine neue Funktion
--    ueberstunden_meldung_tage() ausgelagert, die (unverändert in der Logik,
--    inkl. bereits_verwendet-Abfrage) die Aufschlüsselung JE KALENDERTAG
--    zurückgibt statt nur aggregiert über den ganzen Zeitraum.
--    ueberstunden_berechne_aufschluesselung() wird zu einem dünnen Wrapper,
--    der die Tage aufsummiert und wie bisher auf Viertelstunden rundet -
--    unverändertes Verhalten für die beim Speichern verwendete Gesamtsumme.
--    Eine neue Funktion ueberstunden_monatsanteile(p_monat_start, p_monat_ende)
--    nutzt ueberstunden_meldung_tage() für jede genehmigte, den Monat
--    berührende Meldung MIT DERSELBEN Prioritäts-/Ausschluss-Logik (dieselbe
--    p_exclude_id/p_created_at wie beim ursprünglichen Speichern), auf die
--    Tage dieses Monats geclippt - das reproduziert exakt denselben Split,
--    den die Meldung beim Speichern serverseitig erhalten hat, auch wenn
--    mehrere Meldungen denselben Sonn-/Feiertag teilen. Die client-seitige
--    Monatsübersicht (lib/ueberstunden.ts monatsUebersicht(), Ueberstunden.tsx)
--    ruft jetzt dieses RPC auf, statt die Aufteilung im Browser zu raten.

CREATE OR REPLACE FUNCTION public.ueberstunden_autofill_std() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := clock_timestamp();
  ELSE
    NEW.created_at := OLD.created_at;
  END IF;

  IF ((NEW.bis_datum + NEW.bis_zeit) - (NEW.von_datum + NEW.von_zeit)) > interval '31 days' THEN
    RAISE EXCEPTION 'Der Zeitraum einer einzelnen Meldung darf höchstens 31 Tage umfassen.';
  END IF;

  SELECT a.std_werktag_50, a.std_sonn_100, a.std_19_22, a.std_22_06, a.std_sonn_200
    INTO NEW.std_werktag_50, NEW.std_sonn_100, NEW.std_19_22, NEW.std_22_06, NEW.std_sonn_200
  FROM public.ueberstunden_berechne_aufschluesselung(
    NEW.beamter_id, (NEW.von_datum + NEW.von_zeit)::timestamp, (NEW.bis_datum + NEW.bis_zeit)::timestamp, NEW.id, NEW.created_at
  ) a;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ueberstunden_meldung_tage(p_beamter_id uuid, p_von timestamp, p_bis timestamp, p_exclude_id uuid, p_created_at timestamptz)
RETURNS TABLE(tag date, std_werktag_50 numeric, std_sonn_100 numeric, std_19_22 numeric, std_22_06 numeric, std_sonn_200 numeric)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  cur timestamp := p_von;
  tagesbeginn timestamp;
  naechster_tag timestamp;
  ende timestamp;
  dauer numeric;
  bereits_verwendet numeric;
  verbleibend numeric;
  diese numeric;
  w50 numeric; s100 numeric; s1922 numeric; s2206 numeric; s200 numeric;
  ol_start timestamp; ol_ende timestamp;
BEGIN
  IF p_von IS NULL OR p_bis IS NULL OR p_bis <= p_von THEN
    RETURN;
  END IF;

  WHILE cur < p_bis LOOP
    tagesbeginn := date_trunc('day', cur);
    naechster_tag := tagesbeginn + interval '1 day';
    ende := LEAST(p_bis, naechster_tag);
    dauer := public.ueberstunden_vienna_diff_hours(cur, ende);
    w50 := 0; s100 := 0; s1922 := 0; s2206 := 0; s200 := 0;

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
      s100 := diese;
      s200 := dauer - diese;
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

    tag := tagesbeginn::date;
    std_werktag_50 := w50; std_sonn_100 := s100; std_19_22 := s1922; std_22_06 := s2206; std_sonn_200 := s200;
    RETURN NEXT;

    cur := ende;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ueberstunden_berechne_aufschluesselung(p_beamter_id uuid, p_von timestamp, p_bis timestamp, p_exclude_id uuid, p_created_at timestamptz)
RETURNS TABLE(std_werktag_50 numeric, std_sonn_100 numeric, std_19_22 numeric, std_22_06 numeric, std_sonn_200 numeric)
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  SELECT
    round(COALESCE(SUM(t.std_werktag_50), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_sonn_100), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_19_22), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_22_06), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_sonn_200), 0) * 4) / 4
  INTO std_werktag_50, std_sonn_100, std_19_22, std_22_06, std_sonn_200
  FROM public.ueberstunden_meldung_tage(p_beamter_id, p_von, p_bis, p_exclude_id, p_created_at) t;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ueberstunden_monatsanteile(p_monat_start date, p_monat_ende date)
RETURNS TABLE(meldung_id uuid, beamter_id uuid, verguetung text, std_werktag_50 numeric, std_sonn_100 numeric, std_19_22 numeric, std_22_06 numeric, std_sonn_200 numeric)
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.beamter_id,
    m.verguetung,
    round(COALESCE(SUM(t.std_werktag_50) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_sonn_100) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_19_22) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_22_06) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_sonn_200) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4
  FROM public.ueberstunden_meldungen m
  CROSS JOIN LATERAL public.ueberstunden_meldung_tage(
    m.beamter_id, (m.von_datum + m.von_zeit)::timestamp, (m.bis_datum + m.bis_zeit)::timestamp, m.id, m.created_at
  ) t
  WHERE m.status = 'genehmigt'
    AND m.von_datum < p_monat_ende
    AND m.bis_datum >= p_monat_start
  GROUP BY m.id, m.beamter_id, m.verguetung;
END;
$$;

REVOKE ALL ON FUNCTION public.ueberstunden_meldung_tage(uuid, timestamp, timestamp, uuid, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ueberstunden_monatsanteile(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ueberstunden_meldung_tage(uuid, timestamp, timestamp, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ueberstunden_monatsanteile(date, date) TO authenticated;
