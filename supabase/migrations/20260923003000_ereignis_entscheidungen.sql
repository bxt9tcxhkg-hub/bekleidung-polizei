create table public.ereignis_entscheidungen (
  id uuid primary key default gen_random_uuid(),
  ereignis_id uuid not null references public.ereignisse(id) on delete cascade,
  punkt_key text not null,
  punkt_label text not null,
  status text not null default 'offen' check (status in ('offen','festgelegt','nicht_erforderlich')),
  notiz text,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (ereignis_id, punkt_key)
);
create index ereignis_entscheidungen_ereignis_idx on public.ereignis_entscheidungen(ereignis_id);
create index ereignis_entscheidungen_updated_by_idx on public.ereignis_entscheidungen(updated_by);
alter table public.ereignis_entscheidungen enable row level security;

create policy "Ereignisentscheidungen lesen" on public.ereignis_entscheidungen
for select to authenticated
using (public.has_portal_area_access('zentrale') or public.is_operative_duty_today());

create policy "Ereignisentscheidungen anlegen" on public.ereignis_entscheidungen
for insert to authenticated
with check ((public.can_manage_zentrale() or public.is_zentralist_on_duty()) and updated_by=(select auth.uid()));

create policy "Ereignisentscheidungen ändern" on public.ereignis_entscheidungen
for update to authenticated
using (public.can_manage_zentrale() or public.is_zentralist_on_duty())
with check ((public.can_manage_zentrale() or public.is_zentralist_on_duty()) and updated_by=(select auth.uid()));

revoke all on public.ereignis_entscheidungen from anon;
grant select,insert,update on public.ereignis_entscheidungen to authenticated;
