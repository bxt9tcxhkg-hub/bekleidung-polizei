-- Wichtige Telefonnummern (intern: Nebenstellen der Dienststelle; extern:
-- andere Dienststellen/Behörden) als Karte auf der Zentrale- und
-- Innendienst-Hauptseite, statt der bisherigen Klebezettel am Bildschirm.
-- Lesen für alle mit Zentrale-Zugriff (has_portal_area_access('zentrale')
-- deckt auch Innendienst ab, siehe InnendienstShell.tsx), Pflege nur
-- Admin/Genehmiger.

create table public.wichtige_telefonnummern (
  id uuid primary key default gen_random_uuid(),
  kategorie text not null check (kategorie in ('intern', 'extern')),
  bezeichnung text not null check (length(trim(bezeichnung)) between 1 and 200),
  nummer text not null check (length(trim(nummer)) between 1 and 50),
  hinweis text check (hinweis is null or length(hinweis) <= 200),
  sortierung integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wichtige_telefonnummern_kategorie_idx on public.wichtige_telefonnummern (kategorie, sortierung);

create trigger wichtige_telefonnummern_updated_at before update on public.wichtige_telefonnummern for each row execute function public.update_updated_at();

alter table public.wichtige_telefonnummern enable row level security;

create policy "wichtige_telefonnummern lesen" on public.wichtige_telefonnummern
  for select to authenticated
  using (public.has_portal_area_access('zentrale'));

create policy "wichtige_telefonnummern anlegen" on public.wichtige_telefonnummern
  for insert to authenticated
  with check ((public.has_role('admin') or public.is_genehmiger()) and created_by = (select auth.uid()));

create policy "wichtige_telefonnummern ändern" on public.wichtige_telefonnummern
  for update to authenticated
  using (public.has_role('admin') or public.is_genehmiger())
  with check (public.has_role('admin') or public.is_genehmiger());

create policy "wichtige_telefonnummern löschen" on public.wichtige_telefonnummern
  for delete to authenticated
  using (public.has_role('admin') or public.is_genehmiger());

-- Erstbefüllung mit den bisher am Bildschirm klebenden Listen ("POLIZEI" /
-- "Telefonnummern Dienststelle").
insert into public.wichtige_telefonnummern (kategorie, bezeichnung, nummer, sortierung) values
  ('extern', 'PI Dornbirn', '059 133 8140', 10),
  ('extern', 'PI Hohenems', '059 1338 142100', 20),
  ('extern', 'PI Lustenau', '059 1338 144100', 30),
  ('extern', 'LLZ', '059 133 80 2323', 40),
  ('extern', 'LLZ', '059 133 80 2324', 50),
  ('extern', 'FrePo', '059 133 8145', 60),
  ('extern', 'API Dornbirn', '059 133 8141', 70),
  ('extern', 'BFA Feldkirch', '059 133 8570', 80),
  ('extern', 'LPD Bregenz', '059 133 802 666', 90),
  ('extern', 'ASFINAG', '050 108 396 00', 100),
  ('extern', 'BH Dornbirn', '05572 3080', 110),
  ('extern', 'JD StA', '0676 8989 50029', 120),
  ('intern', 'Kdt - HP Schwendinger', '2600', 10),
  ('intern', 'KdtStv - Andreas Gisinger', '2603', 20),
  ('intern', 'Fundamt - Sonja', '2601', 30),
  ('intern', 'Fundamt - Birgit', '2602', 40),
  ('intern', 'Fundamt - Nina', '2675', 50),
  ('intern', 'Einvernahme Büro', '2605', 60),
  ('intern', 'Fundkeller', '2606', 70),
  ('intern', 'Innendienst Pult', '2609', 80),
  ('intern', 'Innendienst', '2616', 90),
  ('intern', 'SuGi I - Kanzlei 1 (Feu)', '2614', 100),
  ('intern', 'SuGi II - Kanzlei 1', '2625', 110),
  ('intern', 'Journaldienst I - Kanzlei 2', '2631', 120),
  ('intern', 'Journaldienst II - Kanzlei 2', '2617', 130),
  ('intern', 'Journaldienst III - Kanzlei 2', '2632', 140),
  ('intern', 'PSA Karin / Okan', '2620', 150),
  ('intern', 'PSA Werner / Irmgard', '2621', 160),
  ('intern', 'Aufenthaltsraum', '2640', 170),
  ('intern', 'Ruheraum I (FH)', '2641', 180),
  ('intern', 'Ruheraum II (Mitte)', '2642', 190);
