-- Vorbereitung für "Bericht bearbeiten": beim Bearbeiten wird eine Zeile
-- gelöscht und mit ihrem ursprünglichen created_at neu eingefügt (statt
-- "jetzt"), damit ihre Position in der Historie erhalten bleibt. Die
-- bisherige Version dieser Funktion verglich immer mit der GLOBAL neuesten
-- Zeile derselben Straße - bei einer nachträglich mit altem Zeitstempel neu
-- eingefügten Zeile könnte das eine zeitlich SPÄTERE Zeile sein (falsch:
-- die Meldungsart soll sich am Zustand VOR diesem Zeitpunkt orientieren).
-- Jetzt wird explizit nur die letzte Zeile VOR dem eigenen Zeitstempel
-- herangezogen - für normale, chronologische Neuanlagen ändert sich dadurch
-- nichts (die vorherige Zeile hatte ohnehin immer einen früheren Zeitstempel).
CREATE OR REPLACE FUNCTION public.strassenzustand_compute_meldungsart()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  prev_zustand text;
BEGIN
  SELECT z.zustand INTO prev_zustand
  FROM public.strassenzustand_berichtzeilen z
  WHERE z.created_at < NEW.created_at
    AND ((NEW.strasse_id IS NOT NULL AND z.strasse_id = NEW.strasse_id)
      OR (NEW.strasse_id IS NULL AND z.strasse_id IS NULL AND lower(trim(z.strasse_freitext)) = lower(trim(NEW.strasse_freitext))))
  ORDER BY z.created_at DESC
  LIMIT 1;

  IF NEW.zustand = 'frei_befahrbar' THEN
    NEW.meldungsart := 'widerruf';
  ELSIF prev_zustand IS NULL OR prev_zustand = 'frei_befahrbar' THEN
    NEW.meldungsart := 'neuzugang';
  ELSE
    NEW.meldungsart := 'aenderung';
  END IF;
  RETURN NEW;
END;
$function$;
