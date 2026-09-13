-- Personenhinweise und RSa/RSb verweisen jetzt auf einen Eintrag im
-- Personen-Register statt Name/Geburtsdatum als Freitext zu duplizieren.
-- Beide Tabellen sind in der aktuellen Produktionsdatenbank zum Zeitpunkt
-- dieser Migration leer; die Backfill-Blöcke unten sind dadurch No-ops, sorgen
-- aber dafür, dass diese Migration auch bei bereits vorhandenen Altdaten (z. B.
-- in einer anderen Umgebung) nicht an der NOT-NULL-Constraint scheitert und
-- keine bestehenden Datensätze verliert: für jede eindeutige
-- Name/Geburtsdatum/Telefon-Kombination wird eine Person im neuen Register
-- angelegt und verknüpft, bevor die alten Spalten entfernt werden.

alter table public.operational_person_notes
  add column person_id uuid references public.operational_persons(id) on delete cascade;

with distinct_persons as (
  select distinct person_name, birth_date, phone
  from public.operational_person_notes
  where person_id is null
), created as (
  insert into public.operational_persons (name, birth_date, phone)
  select person_name, birth_date, phone from distinct_persons
  returning id, name, birth_date, phone
)
update public.operational_person_notes n
set person_id = c.id
from created c
where n.person_id is null
  and n.person_name = c.name
  and n.birth_date is not distinct from c.birth_date
  and n.phone is not distinct from c.phone;

alter table public.operational_person_notes alter column person_id set not null;
alter table public.operational_person_notes drop column person_name;
alter table public.operational_person_notes drop column birth_date;
alter table public.operational_person_notes drop column phone;
create index operational_person_notes_person_id_idx on public.operational_person_notes (person_id);

alter table public.mail_deliveries
  add column person_id uuid references public.operational_persons(id) on delete cascade;

with distinct_persons as (
  select distinct person_name, person_birth_date
  from public.mail_deliveries
  where person_id is null
), created as (
  insert into public.operational_persons (name, birth_date)
  select person_name, person_birth_date from distinct_persons
  returning id, name, birth_date
)
update public.mail_deliveries m
set person_id = c.id
from created c
where m.person_id is null
  and m.person_name = c.name
  and m.person_birth_date is not distinct from c.birth_date;

alter table public.mail_deliveries alter column person_id set not null;
alter table public.mail_deliveries drop column person_name;
alter table public.mail_deliveries drop column person_birth_date;
create index mail_deliveries_person_id_idx on public.mail_deliveries (person_id);
