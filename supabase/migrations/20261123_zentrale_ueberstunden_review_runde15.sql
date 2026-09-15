-- Reaktion auf zwei P1-Findings:
--
-- 1. Die auf is_zentralist_on_duty() erweiterte UPDATE-Policy für
--    operational_person_notes (20261117_zentrale_on_duty_operative_write_access.sql)
--    erlaubte diensthabenden Nicht-Verwaltungs-Zentralisten uneingeschränkte
--    Änderungen - auch am Feld "active". Die SELECT-Policy
--    (20261024_operational_person_notes_managers_see_archived.sql) zeigt
--    einen inaktiven Hinweis aber nur noch der Verwaltung
--    (can_manage_zentrale()); ein diensthabender Nicht-Verwaltungs-
--    Zentralist konnte einen sicherheitsrelevanten Personenhinweis also
--    durch ein einfaches UPDATE active=false faktisch verschwinden lassen -
--    ein "weiches Löschen" unter Umgehung der bewusst der Verwaltung
--    vorbehaltenen DELETE-Policy. Ein BEFORE-UPDATE-Trigger verbietet jetzt
--    jede Änderung an "active" außer für can_manage_zentrale().
--
-- 2. ueberstunden_meldungen hatte keine Obergrenze für den gemeldeten
--    Zeitraum. Sowohl die clientseitige Live-Vorschau (berechneAufschluesselung)
--    als auch die serverseitige Berechnung (ueberstunden_berechne_aufschluesselung)
--    iterieren den Zeitraum tageweise - bei einem Tippfehler in der
--    Jahreszahl (z. B. "9999") oder einer gezielt manipulierten Anfrage
--    liefe das über Millionen Iterationen, serverseitig zusätzlich mit einer
--    Datenbankabfrage pro Sonn-/Feiertag - ein Browser-Einfrieren bzw. eine
--    massive Ressourcenlast für die Datenbank. Ein neuer CHECK begrenzt den
--    Zeitraum einer einzelnen Meldung auf höchstens 31 Tage (großzügig für
--    eine reale zusammenhängende Überstunden-Meldung, aber eindeutig genug,
--    um die pathologischen Fälle auszuschließen).

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
