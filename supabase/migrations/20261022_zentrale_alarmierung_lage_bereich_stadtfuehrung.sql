-- Grundgerüst für die noch folgende Alarmierungslogik: Alarmierung ergibt
-- sich aus der operativen Lage, unterscheidet sich nach Bereich
-- (Polizei/Städtisch/Beide) und bei größeren Ereignissen muss die
-- Stadtführung informiert werden. Das eigentliche Eskalationsschema (wer
-- wird wann wie informiert) folgt später - hier nur Verknüpfung und
-- Dokumentationsfelder.
alter table public.zentrale_alarmierung add column lage_id uuid references public.zentrale_entries(id) on delete set null;
alter table public.zentrale_alarmierung add column bereich text check (bereich is null or bereich in ('polizei','staedtisch','beide'));
alter table public.zentrale_alarmierung add column stadtfuehrung_informiert boolean not null default false;
alter table public.zentrale_alarmierung add column stadtfuehrung_informiert_am timestamptz;
create index zentrale_alarmierung_lage_id_idx on public.zentrale_alarmierung (lage_id);
