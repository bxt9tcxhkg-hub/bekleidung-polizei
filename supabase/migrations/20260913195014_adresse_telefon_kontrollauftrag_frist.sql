-- Grundlage für "alles, was wir erfassen, soll miteinander verknüpfbar sein":
-- 1) Objekt-Adresse wird zusätzlich strukturiert erfasst (Straße/Hausnummer/
--    PLZ/Ort), statt ausschließlich als ein Freitextfeld - Voraussetzung, um
--    eine Person später eindeutig mit genau diesem Objekt zu verknüpfen statt
--    über einen fehleranfälligen Text-Abgleich der Adresse.
-- 2) Eine Person kann eine Anschrift bekommen - eine echte Verknüpfung zum
--    Objekte-Register, keine erneute Freitext-Eingabe.
-- 3) Telefonnummern werden ein eigenes kleines Register, verknüpfbar mit
--    Person und/oder Objekt (dieselbe Zweifach-Verknüpfung wie bei AV/BV und
--    Fahndungen), statt nur als loses Textfeld bei Person bzw. Kontakt.
-- 4) zentrale_entries bekommt ein Fristfeld, damit ein Kontrollauftrag (z. B.
--    automatisch bei einem AV/BV-Ausspruch) eine Erledigungsfrist tragen kann.
-- Bewusst additiv: bestehende Felder/Formulare (address als Freitext,
-- Person.phone) bleiben unverändert nutzbar, bis die Formulare in einem
-- separaten Schritt umgestellt werden.

alter table public.operational_objects add column strasse text check (strasse is null or length(trim(strasse)) between 1 and 200);
alter table public.operational_objects add column hausnummer text check (hausnummer is null or length(trim(hausnummer)) between 1 and 20);
alter table public.operational_objects add column plz text check (plz is null or length(trim(plz)) between 1 and 10);
alter table public.operational_objects add column ort text check (ort is null or length(trim(ort)) between 1 and 100);

alter table public.operational_persons add column home_object_id uuid references public.operational_objects(id) on delete set null;
create index operational_persons_home_object_id_idx on public.operational_persons (home_object_id);

create table public.operational_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  number text not null check (length(trim(number)) between 1 and 50),
  label text check (label is null or length(label) <= 100),
  person_id uuid references public.operational_persons(id) on delete set null,
  object_id uuid references public.operational_objects(id) on delete set null,
  note text check (note is null or length(note) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index operational_phone_numbers_person_id_idx on public.operational_phone_numbers (person_id);
create index operational_phone_numbers_object_id_idx on public.operational_phone_numbers (object_id);
create trigger operational_phone_numbers_updated_at before update on public.operational_phone_numbers
  for each row execute function public.update_updated_at();

alter table public.operational_phone_numbers enable row level security;
-- Wie bei jeder anderen Tabelle in diesem Schema: RLS-Policies ersetzen keine
-- SQL-Tabellenrechte (siehe 20261015 für die ausführliche Begründung).
revoke all on table public.operational_phone_numbers from public, anon;
grant select, insert, update, delete on table public.operational_phone_numbers to authenticated;
create policy "Telefonnummern lesen" on public.operational_phone_numbers for select
  using (public.has_portal_area_access('zentrale'));
create policy "Telefonnummern anlegen" on public.operational_phone_numbers for insert
  with check (public.can_manage_zentrale() and created_by = (select auth.uid()));
create policy "Telefonnummern ändern" on public.operational_phone_numbers for update
  using (public.can_manage_zentrale()) with check (public.can_manage_zentrale());
create policy "Telefonnummern löschen" on public.operational_phone_numbers for delete
  using (public.can_manage_zentrale());

-- Erledigungsfrist für zentrale_entries (bisher nur lage/kontrollauftrag/
-- uebergabe/brief) - vorerst nur für Kontrollaufträge gedacht (z. B. die
-- 72-Stunden-Frist bei einem automatisch erzeugten Kontrollauftrag aus einem
-- AV/BV-Ausspruch), als generisches Feld aber nicht auf diese Kategorie
-- beschränkt.
alter table public.zentrale_entries add column due_at timestamptz;
