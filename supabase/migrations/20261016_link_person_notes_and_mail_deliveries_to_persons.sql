-- Personenhinweise und RSa/RSb verweisen jetzt auf einen Eintrag im
-- Personen-Register statt Name/Geburtsdatum als Freitext zu duplizieren.
-- Beide Tabellen sind in der aktuellen Produktionsdatenbank zum Zeitpunkt
-- dieser Migration leer; die Backfill-Blöcke unten sind dadurch No-ops, sorgen
-- aber dafür, dass diese Migration auch bei bereits vorhandenen Altdaten (z. B.
-- in einer anderen Umgebung) nicht an der NOT-NULL-Constraint scheitert und
-- keine bestehenden Datensätze verliert.

alter table public.operational_person_notes
  add column person_id uuid references public.operational_persons(id) on delete cascade;

alter table public.mail_deliveries
  add column person_id uuid references public.operational_persons(id) on delete cascade;

-- Eine gemeinsame Menge eindeutiger Personen (Name + Geburtsdatum) aus BEIDEN
-- Quellen ermitteln und je einmal im neuen Register anlegen, damit dieselbe
-- Person nicht doppelt entsteht, wenn sie sowohl bei Personenhinweisen als
-- auch bei RSa/RSb vorkommt. Telefonnummer wird nur informativ aus der ersten
-- Fundstelle übernommen (kein Teil des Abgleichs) und auf die Feldlänge des
-- neuen Registers gekürzt (bisher bis 80, operational_persons.phone bis 50
-- Zeichen) statt eine gültige Altdatenlänge die Migration abbrechen zu lassen.
with distinct_persons as (
  select person_name as name, birth_date, min(phone) as phone
  from (
    select person_name, birth_date, phone from public.operational_person_notes where person_id is null
    union all
    select person_name, person_birth_date, null::text from public.mail_deliveries where person_id is null
  ) src
  group by person_name, birth_date
)
insert into public.operational_persons (name, birth_date, phone)
select name, birth_date, left(phone, 50) from distinct_persons;

update public.operational_person_notes n
set person_id = p.id
from public.operational_persons p
where n.person_id is null
  and p.name = n.person_name
  and p.birth_date is not distinct from n.birth_date;

update public.mail_deliveries m
set person_id = p.id
from public.operational_persons p
where m.person_id is null
  and p.name = m.person_name
  and p.birth_date is not distinct from m.person_birth_date;

alter table public.operational_person_notes alter column person_id set not null;
alter table public.operational_person_notes drop column person_name;
alter table public.operational_person_notes drop column birth_date;
alter table public.operational_person_notes drop column phone;
create index operational_person_notes_person_id_idx on public.operational_person_notes (person_id);

alter table public.mail_deliveries alter column person_id set not null;
alter table public.mail_deliveries drop column person_name;
alter table public.mail_deliveries drop column person_birth_date;
create index mail_deliveries_person_id_idx on public.mail_deliveries (person_id);
