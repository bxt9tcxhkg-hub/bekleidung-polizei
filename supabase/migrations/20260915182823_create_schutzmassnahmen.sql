
create table public.schutzfaelle (
  id uuid primary key default gen_random_uuid(),
  massnahme text not null check (massnahme in ('bv_av','ev')),
  ev_rechtsgrundlage text null check (ev_rechtsgrundlage in ('382b','382c','kombiniert')),
  gefaehrder_id uuid not null references public.operational_persons(id) on delete restrict,
  pad_aktenzahl text not null check (length(btrim(pad_aktenzahl)) between 2 and 120),
  externe_aktenzahl text null check (externe_aktenzahl is null or length(externe_aktenzahl) <= 120),
  ausstellende_stelle text null check (ausstellende_stelle is null or length(ausstellende_stelle) <= 200),
  beginn timestamptz not null default now(),
  ende timestamptz not null,
  status text not null default 'aktiv' check (status in ('aktiv','aufgehoben','abgelaufen')),
  waffenverbot boolean not null default false,
  schluessel_status text not null default 'nicht_erfasst'
    check (schluessel_status in ('nicht_erfasst','abgenommen','verwahrt','gericht','ausgefolgt')),
  schluessel_verwahrort text null check (schluessel_verwahrort is null or length(schluessel_verwahrort) <= 300),
  ausnahmen text null check (ausnahmen is null or length(ausnahmen) <= 3000),
  hinweise text null check (hinweise is null or length(hinweise) <= 5000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schutzfaelle_zeitraum_check check (ende > beginn),
  constraint schutzfaelle_massnahme_rechtsgrundlage_check check (
    (massnahme = 'ev' and ev_rechtsgrundlage is not null)
    or (massnahme = 'bv_av' and ev_rechtsgrundlage is null)
  )
);

create unique index schutzfaelle_pad_massnahme_uidx
  on public.schutzfaelle (lower(btrim(pad_aktenzahl)), massnahme);
create index schutzfaelle_status_ende_idx on public.schutzfaelle (status, ende);
create index schutzfaelle_gefaehrder_idx on public.schutzfaelle (gefaehrder_id);
create index schutzfaelle_created_by_idx on public.schutzfaelle (created_by);

create table public.schutzfall_personen (
  schutzfall_id uuid not null references public.schutzfaelle(id) on delete cascade,
  person_id uuid not null references public.operational_persons(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (schutzfall_id, person_id)
);
create index schutzfall_personen_person_idx on public.schutzfall_personen (person_id);

create table public.schutzbereiche (
  id uuid primary key default gen_random_uuid(),
  schutzfall_id uuid not null references public.schutzfaelle(id) on delete cascade,
  art text not null check (art in ('wohnung','ort')),
  object_id uuid null references public.operational_objects(id) on delete set null,
  bezeichnung text not null check (length(btrim(bezeichnung)) between 2 and 300),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null check (radius_m between 1 and 5000),
  position_bestaetigt boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index schutzbereiche_schutzfall_idx on public.schutzbereiche (schutzfall_id);
create index schutzbereiche_object_idx on public.schutzbereiche (object_id);
create unique index schutzbereiche_bv_av_wohnung_uidx
  on public.schutzbereiche (schutzfall_id) where art = 'wohnung';

create table public.schutzkontrollen (
  id uuid primary key default gen_random_uuid(),
  schutzfall_id uuid not null references public.schutzfaelle(id) on delete cascade,
  kontrolliert_am timestamptz not null default now(),
  notiz text null check (notiz is null or length(notiz) <= 3000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index schutzkontrollen_schutzfall_zeit_idx
  on public.schutzkontrollen (schutzfall_id, kontrolliert_am desc);
create index schutzkontrollen_created_by_idx on public.schutzkontrollen (created_by);

create or replace function public.enforce_schutzbereich_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_massnahme text;
begin
  select massnahme into v_massnahme
  from public.schutzfaelle
  where id = new.schutzfall_id;

  if v_massnahme is null then
    raise exception 'Schutzfall nicht gefunden.';
  end if;

  if v_massnahme = 'bv_av' and (new.art <> 'wohnung' or new.radius_m <> 100) then
    raise exception 'Ein BV/AV hat genau einen bestätigten 100-m-Schutzbereich um die Wohnung.';
  end if;

  if v_massnahme = 'ev' and new.art <> 'ort' then
    raise exception 'Schutzbereiche einer EV müssen als konkrete Orte erfasst werden.';
  end if;

  return new;
end;
$$;

create trigger schutzbereiche_enforce_rules
before insert or update on public.schutzbereiche
for each row execute function public.enforce_schutzbereich_rules();

create or replace function public.touch_schutz_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schutzfaelle_touch_updated_at
before update on public.schutzfaelle
for each row execute function public.touch_schutz_updated_at();
create trigger schutzbereiche_touch_updated_at
before update on public.schutzbereiche
for each row execute function public.touch_schutz_updated_at();
create trigger schutzkontrollen_touch_updated_at
before update on public.schutzkontrollen
for each row execute function public.touch_schutz_updated_at();

alter table public.schutzfaelle enable row level security;
alter table public.schutzfall_personen enable row level security;
alter table public.schutzbereiche enable row level security;
alter table public.schutzkontrollen enable row level security;

grant select, insert, update, delete on public.schutzfaelle to authenticated;
grant select, insert, update, delete on public.schutzfall_personen to authenticated;
grant select, insert, update, delete on public.schutzbereiche to authenticated;
grant select, insert, update, delete on public.schutzkontrollen to authenticated;

create policy schutzfaelle_select on public.schutzfaelle
for select to authenticated
using ((select public.has_portal_area_access('zentrale')));

create policy schutzfaelle_insert on public.schutzfaelle
for insert to authenticated
with check (
  ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()))
  and created_by = (select auth.uid())
);

create policy schutzfaelle_update on public.schutzfaelle
for update to authenticated
using ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()))
with check ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()));

create policy schutzfaelle_delete on public.schutzfaelle
for delete to authenticated
using ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()));

create policy schutzfall_personen_select on public.schutzfall_personen
for select to authenticated
using ((select public.has_portal_area_access('zentrale')));

create policy schutzfall_personen_insert on public.schutzfall_personen
for insert to authenticated
with check (
  ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()))
  and exists (select 1 from public.schutzfaelle s where s.id = schutzfall_id)
);

create policy schutzfall_personen_update on public.schutzfall_personen
for update to authenticated
using ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()))
with check ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()));

create policy schutzfall_personen_delete on public.schutzfall_personen
for delete to authenticated
using ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()));

create policy schutzbereiche_select on public.schutzbereiche
for select to authenticated
using ((select public.has_portal_area_access('zentrale')));

create policy schutzbereiche_insert on public.schutzbereiche
for insert to authenticated
with check (
  ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()))
  and exists (select 1 from public.schutzfaelle s where s.id = schutzfall_id)
);

create policy schutzbereiche_update on public.schutzbereiche
for update to authenticated
using ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()))
with check ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()));

create policy schutzbereiche_delete on public.schutzbereiche
for delete to authenticated
using ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()));

create policy schutzkontrollen_select on public.schutzkontrollen
for select to authenticated
using ((select public.has_portal_area_access('zentrale')));

create policy schutzkontrollen_insert on public.schutzkontrollen
for insert to authenticated
with check (
  (select public.has_portal_area_access('zentrale'))
  and created_by = (select auth.uid())
  and exists (select 1 from public.schutzfaelle s where s.id = schutzfall_id)
);

create policy schutzkontrollen_update on public.schutzkontrollen
for update to authenticated
using (
  created_by = (select auth.uid())
  or (select public.can_manage_zentrale())
  or (select public.is_zentralist_on_duty())
)
with check (
  created_by = (select auth.uid())
  or (select public.can_manage_zentrale())
  or (select public.is_zentralist_on_duty())
);

create policy schutzkontrollen_delete on public.schutzkontrollen
for delete to authenticated
using ((select public.can_manage_zentrale()) or (select public.is_zentralist_on_duty()));

