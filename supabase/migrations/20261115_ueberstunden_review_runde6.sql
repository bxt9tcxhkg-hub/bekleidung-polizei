-- Reaktion auf ein Review-Finding (echter Bug in
-- 20261114_ueberstunden_review_runde5.sql): beim Verschieben einer
-- Meldung (z. B. Rückfrage-Bearbeitung, Zeitraum wird von 06:00 auf 14:00
-- geändert) reallokierte der "alte Zeitraum"-Zweig fälschlich ab dem NEUEN
-- Start statt ab dem ALTEN Start - eine Meldung, die vorher ZWISCHEN altem
-- und neuem Start lag und die verschobene Meldung korrekterweise als
-- "früher" gezählt hatte, wurde dadurch nicht neu berechnet, obwohl sie es
-- hätte sein müssen. Fix: der OLD-Zweig reallokiert jetzt korrekt ab
-- OLD.von_datum/von_zeit/id, der NEW-Zweig bleibt unverändert bei NEW.

CREATE OR REPLACE FUNCTION public.ueberstunden_nach_aenderung() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  tagrow record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.ueberstunden_zaehlt_zum_topf(OLD.status) THEN
      FOR tagrow IN
        SELECT th.tag FROM public.ueberstunden_tagesstunden((OLD.von_datum + OLD.von_zeit)::timestamp, (OLD.bis_datum + OLD.bis_zeit)::timestamp) th
        WHERE public.ist_sonn_oder_feiertag(th.tag)
      LOOP
        PERFORM public.ueberstunden_reallocate_nachfolgende(OLD.beamter_id, tagrow.tag, (OLD.von_datum + OLD.von_zeit)::timestamp, OLD.id);
      END LOOP;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.von_datum IS DISTINCT FROM OLD.von_datum OR NEW.von_zeit IS DISTINCT FROM OLD.von_zeit
     OR NEW.bis_datum IS DISTINCT FROM OLD.bis_datum OR NEW.bis_zeit IS DISTINCT FROM OLD.bis_zeit
     OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    IF public.ueberstunden_zaehlt_zum_topf(OLD.status) THEN
      FOR tagrow IN
        SELECT th.tag FROM public.ueberstunden_tagesstunden((OLD.von_datum + OLD.von_zeit)::timestamp, (OLD.bis_datum + OLD.bis_zeit)::timestamp) th
        WHERE public.ist_sonn_oder_feiertag(th.tag)
      LOOP
        -- Fix: ab dem ALTEN Start reallokieren (die Meldung verlässt diese
        -- Position) - vorher stand hier fälschlich NEW.
        PERFORM public.ueberstunden_reallocate_nachfolgende(OLD.beamter_id, tagrow.tag, (OLD.von_datum + OLD.von_zeit)::timestamp, OLD.id);
      END LOOP;
    END IF;
    IF public.ueberstunden_zaehlt_zum_topf(NEW.status) THEN
      FOR tagrow IN
        SELECT th.tag FROM public.ueberstunden_tagesstunden((NEW.von_datum + NEW.von_zeit)::timestamp, (NEW.bis_datum + NEW.bis_zeit)::timestamp) th
        WHERE public.ist_sonn_oder_feiertag(th.tag)
      LOOP
        PERFORM public.ueberstunden_reallocate_nachfolgende(NEW.beamter_id, tagrow.tag, (NEW.von_datum + NEW.von_zeit)::timestamp, NEW.id);
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
