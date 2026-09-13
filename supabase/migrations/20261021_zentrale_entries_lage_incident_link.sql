-- Eine Operative Lage ist kein eigenständiger Bereich, sondern ergibt sich
-- immer aus einer Einsatzmeldung - daher zwingende Verknüpfung für category
-- 'lage'. Andere Kategorien (kontrollauftrag, uebergabe, brief) bleiben ohne
-- Einsatzbezug. Tabelle war zum Zeitpunkt der Migration leer.
alter table public.zentrale_entries add column incident_id uuid references public.incident_reports(id) on delete cascade;
create index zentrale_entries_incident_id_idx on public.zentrale_entries (incident_id);
-- NOT VALID: eine bereits vorhandene 'lage'-Zeile aus der Zeit vor dieser
-- Migration kennt ihre auslösende Einsatzmeldung nicht (die Spalte gab es
-- noch nicht) und lässt sich nicht rückwirkend befüllen. Neue/geänderte
-- Zeilen werden trotzdem sofort geprüft - nur die Validierung bestehender
-- Altzeilen wird übersprungen.
alter table public.zentrale_entries add constraint zentrale_entries_lage_requires_incident
  check (category <> 'lage' or incident_id is not null) not valid;
