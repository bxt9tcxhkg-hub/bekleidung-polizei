-- Zentrales Personen- und Objekte-Register, damit Personenhinweise, RSa/RSb,
-- AV/BV & EV, Fahndungen, Schlüssel und Kontakte auf dieselbe Person bzw.
-- dasselbe Objekt (Adresse/Gebäude) verweisen können, statt Namen/Adressen
-- in jeder Kategorie separat als Freitext zu erfassen.

create table public.operational_persons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  birth_date date,
  phone text check (phone is null or length(phone) <= 50),
  note text check (note is null or length(note) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index operational_persons_name_idx on public.operational_persons (lower(name));
create trigger operational_persons_updated_at before update on public.operational_persons
  for each row execute function public.update_updated_at();

create table public.operational_objects (
  id uuid primary key default gen_random_uuid(),
  address text not null check (length(trim(address)) between 1 and 200),
  label text check (label is null or length(label) <= 200),
  note text check (note is null or length(note) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index operational_objects_address_idx on public.operational_objects (lower(address));
create trigger operational_objects_updated_at before update on public.operational_objects
  for each row execute function public.update_updated_at();

alter table public.operational_persons enable row level security;
alter table public.operational_objects enable row level security;

create policy "Personen lesen" on public.operational_persons for select
  using (public.has_portal_area_access('zentrale'));
create policy "Personen anlegen" on public.operational_persons for insert
  with check (public.can_manage_zentrale() and created_by = (select auth.uid()));
create policy "Personen ändern" on public.operational_persons for update
  using (public.can_manage_zentrale()) with check (public.can_manage_zentrale());
create policy "Personen löschen" on public.operational_persons for delete
  using (public.can_manage_zentrale());

create policy "Objekte lesen" on public.operational_objects for select
  using (public.has_portal_area_access('zentrale'));
create policy "Objekte anlegen" on public.operational_objects for insert
  with check (public.can_manage_zentrale() and created_by = (select auth.uid()));
create policy "Objekte ändern" on public.operational_objects for update
  using (public.can_manage_zentrale()) with check (public.can_manage_zentrale());
create policy "Objekte löschen" on public.operational_objects for delete
  using (public.can_manage_zentrale());
