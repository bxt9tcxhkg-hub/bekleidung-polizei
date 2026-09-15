-- Schichtübergabe wird nicht mehr manuell erfasst, sondern ergibt sich aus
-- den am Ende der Schicht noch offenen Einsatzmeldungen (incident_reports) -
-- kein eigener Eintrag mehr nötig. Tabelle war zum Zeitpunkt der Migration leer.
alter table public.zentrale_entries drop constraint zentrale_entries_category_check;
alter table public.zentrale_entries add constraint zentrale_entries_category_check
  check (category = any (array['lage','kontrollauftrag','brief']));
