-- Straßenzustand: optionale Kartengeometrie je Stammdaten-Straße (analog zu
-- zentrale_baustellen), damit eine aktive Sperre automatisch als Linie auf
-- der Karte erscheint, statt nur als Listeneintrag. Einmalig je Straße von
-- einem Sachbearbeiter/Genehmiger gesetzt (siehe ZentraleStrassenzustand.tsx),
-- nicht pro Bericht - "Sonstige" (Freitext-Straße ohne Stammdatensatz) bleibt
-- ohne automatische Markierung, da es dafür keine wiederverwendbare Geometrie gibt.
ALTER TABLE public.strassenzustand_strassen
  ADD COLUMN start_lat double precision,
  ADD COLUMN start_lng double precision,
  ADD COLUMN end_lat double precision,
  ADD COLUMN end_lng double precision,
  -- Abgeleiteter Streckenverlauf entlang des Straßennetzes als JSON-Array
  -- [[lat,lng],...] - wie bei zentrale_baustellen.path; null = Luftlinie.
  ADD COLUMN path jsonb;
