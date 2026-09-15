create table public.zentrale_baustellen (
  id uuid primary key default gen_random_uuid(),
  titel text not null check (length(trim(titel)) between 1 and 200),
  start_lat double precision not null,
  start_lng double precision not null,
  end_lat double precision not null,
  end_lng double precision not null,
  note text check (note is null or length(note) <= 1000),
  status text not null default 'gemeldet' check (status in ('gemeldet','offen','erledigt')),
  gueltig_bis date,
  restricted boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index zentrale_baustellen_status_idx on public.zentrale_baustellen (status);
create trigger zentrale_baustellen_updated_at before update on public.zentrale_baustellen
  for each row execute function public.update_updated_at();

alter table public.zentrale_baustellen enable row level security;
revoke all on table public.zentrale_baustellen from public, anon;
grant select, insert, update, delete on table public.zentrale_baustellen to authenticated;

create policy "Baustellen lesen" on public.zentrale_baustellen for select
  using (public.has_portal_area_access('zentrale') and (not restricted or public.can_manage_zentrale()));

create policy "Baustellen melden" on public.zentrale_baustellen for insert
  with check (
    public.has_portal_area_access('zentrale')
    and created_by = (select auth.uid())
    and (status = 'gemeldet' or public.can_manage_zentrale())
    and confirmed_by is null
    and confirmed_at is null
  );

create policy "Baustellen ändern" on public.zentrale_baustellen for update
  using (public.can_manage_zentrale()) with check (public.can_manage_zentrale());

create policy "Baustellen löschen" on public.zentrale_baustellen for delete
  using (public.can_manage_zentrale());
