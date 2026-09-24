-- Telefonnummern aus dem Benutzerprofil getrennt speichern: Profile selbst
-- sind auch für Verwaltungsrollen außerhalb des Kontaktregisters lesbar.
create table public.profile_phone_numbers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  diensthandy text check (diensthandy is null or length(trim(diensthandy)) between 1 and 50),
  privathandy text check (privathandy is null or length(trim(privathandy)) between 1 and 50),
  updated_at timestamptz not null default now()
);

create trigger profile_phone_numbers_updated_at before update on public.profile_phone_numbers
for each row execute function public.update_updated_at();

alter table public.profile_phone_numbers enable row level security;
revoke all on public.profile_phone_numbers from anon, authenticated;
grant select, insert on public.profile_phone_numbers to authenticated;
grant update (diensthandy, privathandy) on public.profile_phone_numbers to authenticated;

create policy "Eigene Telefonnummern lesen" on public.profile_phone_numbers
for select to authenticated using (user_id = (select auth.uid()));
create policy "Dienstliche Telefonnummern lesen" on public.profile_phone_numbers
for select to authenticated using (
  public.has_portal_area_access('zentrale')
  or public.has_portal_area_access('datenpflege')
  or public.is_operative_duty_today()
  or public.has_role('admin')
);
create policy "Eigene Telefonnummern anlegen" on public.profile_phone_numbers
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles where id = (select auth.uid()) and active)
);
create policy "Eigene Telefonnummern bearbeiten" on public.profile_phone_numbers
for update to authenticated using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
