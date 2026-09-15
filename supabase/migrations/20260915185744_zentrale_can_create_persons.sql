
drop policy if exists "Personen anlegen" on public.operational_persons;
create policy "Personen anlegen"
on public.operational_persons
for insert
to authenticated
with check (
  (select public.has_portal_area_access('zentrale'))
  and created_by = (select auth.uid())
);

drop policy if exists "Telefonnummern anlegen" on public.operational_phone_numbers;
create policy "Telefonnummern anlegen"
on public.operational_phone_numbers
for insert
to authenticated
with check (
  (select public.has_portal_area_access('zentrale'))
  and created_by = (select auth.uid())
);
