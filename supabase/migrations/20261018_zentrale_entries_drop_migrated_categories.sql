-- verbot/fahndung/schluessel/kontakt/alarmierung/unterlage haben jetzt eigene
-- Tabellen (siehe zentrale_register_category_tables) und werden hier nicht
-- mehr angelegt. Bereits vorhandene generische Einträge dieser Kategorien
-- werden zuerst bestmöglich in die neuen Tabellen übernommen und anschließend
-- aus zentrale_entries entfernt, statt sie beim Verengen der CHECK-Constraint
-- zu verlieren oder die Migration fehlschlagen zu lassen. In der aktuellen
-- Produktionsdatenbank ist die Tabelle zum Zeitpunkt dieser Migration leer
-- (siehe vorherige Migration), diese Blöcke sind daher No-ops; die Zuordnung
-- z. B. der Art bei AV/BV/Fahndung ist best-effort (die alte generische Zeile
-- kannte keinen Typ) und müsste bei tatsächlich vorhandenen Altdaten manuell
-- nachkontrolliert werden. lage/kontrollauftrag/uebergabe/brief bleiben
-- unverändert generisch.

insert into public.zentrale_av_bv (art, grund, gueltig_von, gueltig_bis, note, priority, status, restricted, created_by, created_at, updated_at)
select
  'amtsverbot',
  left(coalesce(nullif(trim(description), ''), title), 1000),
  valid_from,
  valid_until,
  case when description is not null then title else null end,
  priority,
  case status when 'erledigt' then 'erledigt' else 'offen' end,
  restricted, created_by, created_at, updated_at
from public.zentrale_entries where category = 'verbot';
delete from public.zentrale_entries where category = 'verbot';

insert into public.zentrale_fahndungen (art, beschreibung, gueltig_bis, note, priority, status, restricted, created_by, created_at, updated_at)
select
  'sonstiges',
  left(coalesce(nullif(trim(description), ''), title), 2000),
  valid_until,
  case when description is not null then title else null end,
  priority,
  case status when 'erledigt' then 'erledigt' else 'offen' end,
  restricted, created_by, created_at, updated_at
from public.zentrale_entries where category = 'fahndung';
delete from public.zentrale_entries where category = 'fahndung';

insert into public.zentrale_schluessel (schluessel_nummer, verwahrort, note, status, restricted, created_by, created_at, updated_at)
select
  left(title, 100),
  location,
  left(nullif(trim(description), ''), 1000),
  case status when 'erledigt' then 'verfuegbar' else 'ausgegeben' end,
  restricted, created_by, created_at, updated_at
from public.zentrale_entries where category = 'schluessel';
delete from public.zentrale_entries where category = 'schluessel';

insert into public.zentrale_kontakte (name, funktion, note, restricted, created_by, created_at, updated_at)
select
  left(title, 200),
  responsible,
  nullif(left(trim(concat_ws(E'\n', description, reference)), 1000), ''),
  restricted, created_by, created_at, updated_at
from public.zentrale_entries where category = 'kontakt';
delete from public.zentrale_entries where category = 'kontakt';

insert into public.zentrale_alarmierung (anlass, ablauf, gueltig_bis, note, restricted, created_by, created_at, updated_at)
select
  left(title, 200),
  left(description, 2000),
  valid_until,
  nullif(left(reference, 1000), ''),
  restricted, created_by, created_at, updated_at
from public.zentrale_entries where category = 'alarmierung';
delete from public.zentrale_entries where category = 'alarmierung';

insert into public.zentrale_unterlagen (titel, fundort, gueltig_bis, note, restricted, created_by, created_at, updated_at)
select
  left(title, 200),
  location,
  valid_until,
  nullif(left(trim(concat_ws(E'\n', description, reference)), 1000), ''),
  restricted, created_by, created_at, updated_at
from public.zentrale_entries where category = 'unterlage';
delete from public.zentrale_entries where category = 'unterlage';

alter table public.zentrale_entries drop constraint zentrale_entries_category_check;
alter table public.zentrale_entries add constraint zentrale_entries_category_check
  check (category = any (array['lage','kontrollauftrag','uebergabe','brief']));
