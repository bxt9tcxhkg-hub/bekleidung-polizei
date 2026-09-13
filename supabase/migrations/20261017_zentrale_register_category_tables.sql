-- Ersetzt die sechs generischen zentrale_entries-Kategorien (AV/BV & EV,
-- Fahndungen, Schlüssel, Kontakte, Alarmierung, Unterlagen) durch eigene
-- Tabellen mit den tatsächlich benötigten Feldern, inkl. Verknüpfung zu
-- Person/Objekt wo fachlich sinnvoll.

create table public.zentrale_av_bv (
  id uuid primary key default gen_random_uuid(),
  art text not null check (art in ('amtsverbot','betretungsverbot','einreiseverbot')),
  person_id uuid references public.operational_persons(id) on delete set null,
  object_id uuid references public.operational_objects(id) on delete set null,
  gebiet text check (gebiet is null or length(gebiet) <= 200),
  grund text not null check (length(trim(grund)) between 1 and 1000),
  ausstellende_behoerde text check (ausstellende_behoerde is null or length(ausstellende_behoerde) <= 200),
  aktenzeichen text check (aktenzeichen is null or length(aktenzeichen) <= 100),
  gueltig_von date,
  gueltig_bis date,
  note text check (note is null or length(note) <= 2000),
  priority text not null default 'normal' check (priority in ('normal','hoch','kritisch')),
  status text not null default 'offen' check (status in ('offen','erledigt')),
  restricted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint zentrale_av_bv_valid_range check (gueltig_von is null or gueltig_bis is null or gueltig_bis >= gueltig_von)
);

create table public.zentrale_fahndungen (
  id uuid primary key default gen_random_uuid(),
  art text not null check (art in ('person','fahrzeug','objekt','sonstiges')),
  person_id uuid references public.operational_persons(id) on delete set null,
  object_id uuid references public.operational_objects(id) on delete set null,
  beschreibung text not null check (length(trim(beschreibung)) between 1 and 2000),
  aktenzeichen text check (aktenzeichen is null or length(aktenzeichen) <= 100),
  ausschreibende_dienststelle text check (ausschreibende_dienststelle is null or length(ausschreibende_dienststelle) <= 200),
  gueltig_bis date,
  note text check (note is null or length(note) <= 2000),
  priority text not null default 'normal' check (priority in ('normal','hoch','kritisch')),
  status text not null default 'offen' check (status in ('offen','erledigt')),
  restricted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zentrale_schluessel (
  id uuid primary key default gen_random_uuid(),
  schluessel_nummer text not null check (length(trim(schluessel_nummer)) between 1 and 100),
  object_id uuid references public.operational_objects(id) on delete set null,
  verwahrort text check (verwahrort is null or length(verwahrort) <= 200),
  held_by uuid references public.profiles(id) on delete set null,
  note text check (note is null or length(note) <= 1000),
  status text not null default 'verfuegbar' check (status in ('verfuegbar','ausgegeben')),
  restricted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zentrale_kontakte (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  institution text check (institution is null or length(institution) <= 200),
  funktion text check (funktion is null or length(funktion) <= 200),
  telefon text check (telefon is null or length(telefon) <= 50),
  email text check (email is null or length(email) <= 200),
  erreichbarkeit text check (erreichbarkeit is null or length(erreichbarkeit) <= 200),
  object_id uuid references public.operational_objects(id) on delete set null,
  note text check (note is null or length(note) <= 1000),
  restricted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zentrale_alarmierung (
  id uuid primary key default gen_random_uuid(),
  anlass text not null check (length(trim(anlass)) between 1 and 200),
  ablauf text check (ablauf is null or length(ablauf) <= 2000),
  gueltig_bis date,
  note text check (note is null or length(note) <= 1000),
  restricted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zentrale_unterlagen (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (length(trim(titel)) between 1 and 200),
  typ text check (typ is null or length(typ) <= 100),
  fundort text check (fundort is null or length(fundort) <= 500),
  gueltig_bis date,
  note text check (note is null or length(note) <= 1000),
  restricted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index zentrale_av_bv_person_id_idx on public.zentrale_av_bv (person_id);
create index zentrale_av_bv_object_id_idx on public.zentrale_av_bv (object_id);
create index zentrale_fahndungen_person_id_idx on public.zentrale_fahndungen (person_id);
create index zentrale_fahndungen_object_id_idx on public.zentrale_fahndungen (object_id);
create index zentrale_schluessel_object_id_idx on public.zentrale_schluessel (object_id);
create index zentrale_kontakte_object_id_idx on public.zentrale_kontakte (object_id);

create trigger zentrale_av_bv_updated_at before update on public.zentrale_av_bv for each row execute function public.update_updated_at();
create trigger zentrale_fahndungen_updated_at before update on public.zentrale_fahndungen for each row execute function public.update_updated_at();
create trigger zentrale_schluessel_updated_at before update on public.zentrale_schluessel for each row execute function public.update_updated_at();
create trigger zentrale_kontakte_updated_at before update on public.zentrale_kontakte for each row execute function public.update_updated_at();
create trigger zentrale_alarmierung_updated_at before update on public.zentrale_alarmierung for each row execute function public.update_updated_at();
create trigger zentrale_unterlagen_updated_at before update on public.zentrale_unterlagen for each row execute function public.update_updated_at();

alter table public.zentrale_av_bv enable row level security;
alter table public.zentrale_fahndungen enable row level security;
alter table public.zentrale_schluessel enable row level security;
alter table public.zentrale_kontakte enable row level security;
alter table public.zentrale_alarmierung enable row level security;
alter table public.zentrale_unterlagen enable row level security;

do $$
declare t text;
begin
  foreach t in array array['zentrale_av_bv','zentrale_fahndungen','zentrale_schluessel','zentrale_kontakte','zentrale_alarmierung','zentrale_unterlagen'] loop
    -- Wie bei jeder anderen Tabelle in diesem Schema: RLS-Policies ersetzen
    -- keine SQL-Tabellenrechte (siehe 20261015 für die ausführliche Begründung).
    execute format('revoke all on table public.%1$s from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%1$s to authenticated', t);
    execute format('create policy "%1$s lesen" on public.%1$s for select using (public.has_portal_area_access(''zentrale'') and (not restricted or public.can_manage_zentrale()))', t);
    execute format('create policy "%1$s anlegen" on public.%1$s for insert with check (public.can_manage_zentrale() and created_by = (select auth.uid()))', t);
    execute format('create policy "%1$s ändern" on public.%1$s for update using (public.can_manage_zentrale()) with check (public.can_manage_zentrale())', t);
    execute format('create policy "%1$s löschen" on public.%1$s for delete using (public.can_manage_zentrale())', t);
  end loop;
end $$;
