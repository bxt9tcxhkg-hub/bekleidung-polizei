-- Speichert die per Klick aufgelösten Koordinaten eines Einsatzortes, damit
-- die Gesamtkarte in der Übersicht nicht bei jedem Laden erneut geocodieren
-- muss (Nominatim-Nutzungsgrenze) und der Ort auch nach dem Speichern noch
-- korrekt auf der Karte angezeigt werden kann.
ALTER TABLE public.incident_reports ADD COLUMN location_lat double precision CHECK (location_lat IS NULL OR location_lat BETWEEN -90 AND 90);
ALTER TABLE public.incident_reports ADD COLUMN location_lng double precision CHECK (location_lng IS NULL OR location_lng BETWEEN -180 AND 180);
