-- Eine Operative Lage ist kein eigenständiger Bereich, sondern ergibt sich
-- immer aus einer Einsatzmeldung - daher zwingende Verknüpfung für category
-- 'lage'. Andere Kategorien (kontrollauftrag, uebergabe, brief) bleiben ohne
-- Einsatzbezug. Tabelle war zum Zeitpunkt der Migration leer.
alter table public.zentrale_entries add column incident_id uuid references public.incident_reports(id) on delete cascade;
create index zentrale_entries_incident_id_idx on public.zentrale_entries (incident_id);
alter table public.zentrale_entries add constraint zentrale_entries_lage_requires_incident
  check (category <> 'lage' or incident_id is not null);
