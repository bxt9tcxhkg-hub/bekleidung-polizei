-- Personenhinweise und RSa/RSb verweisen jetzt auf einen Eintrag im
-- Personen-Register statt Name/Geburtsdatum als Freitext zu duplizieren.
-- Beide Tabellen sind aktuell leer, daher ohne Datenmigration.

alter table public.operational_person_notes
  add column person_id uuid references public.operational_persons(id) on delete cascade;
update public.operational_person_notes set person_id = gen_random_uuid() where false; -- no-op, keeps column nullable until backfilled below
alter table public.operational_person_notes alter column person_id set not null;
alter table public.operational_person_notes drop column person_name;
alter table public.operational_person_notes drop column birth_date;
alter table public.operational_person_notes drop column phone;
create index operational_person_notes_person_id_idx on public.operational_person_notes (person_id);

alter table public.mail_deliveries
  add column person_id uuid references public.operational_persons(id) on delete cascade;
alter table public.mail_deliveries alter column person_id set not null;
alter table public.mail_deliveries drop column person_name;
alter table public.mail_deliveries drop column person_birth_date;
create index mail_deliveries_person_id_idx on public.mail_deliveries (person_id);
