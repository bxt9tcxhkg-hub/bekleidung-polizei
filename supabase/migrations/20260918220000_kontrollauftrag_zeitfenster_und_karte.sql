-- Kontrollaufträge brauchen neben der tageweisen Gültigkeit (valid_from/
-- valid_until, nur Datum) auch eine genauere zeitliche Vorgabe innerhalb
-- dieser Tage (z. B. "ab 19:00 Uhr", oft ein täglich wiederkehrendes
-- Zeitfenster im Streifendienst, kein einzelner Zeitpunkt - daher Freitext
-- statt eines weiteren Datums-/Zeitfelds) sowie eine Position für die
-- Kartenansicht (wie bei "Neue Meldung"), bisher hatte zentrale_entries gar
-- keine Koordinaten.
alter table public.zentrale_entries add column zeitfenster text check (zeitfenster is null or length(zeitfenster) <= 200);
alter table public.zentrale_entries add column location_lat double precision;
alter table public.zentrale_entries add column location_lng double precision;
comment on column public.zentrale_entries.zeitfenster is 'Freitext für eine zeitliche Eingrenzung innerhalb der Gültigkeit, z. B. "ab 19:00 Uhr" - nicht auf category kontrollauftrag beschränkt.';
