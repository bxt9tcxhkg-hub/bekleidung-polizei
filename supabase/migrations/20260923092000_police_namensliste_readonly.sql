drop policy if exists "Namensliste anlegen" on public.einsatz_namensliste;
create policy "Namensliste anlegen"
on public.einsatz_namensliste for insert
to authenticated
with check (
  has_portal_area_access('zentrale')
  and listenart = 'haus'
  and (created_by is null or created_by = (select auth.uid()))
);

drop policy if exists "Namensliste ändern" on public.einsatz_namensliste;
create policy "Namensliste ändern"
on public.einsatz_namensliste for update
to authenticated
using (
  has_portal_area_access('zentrale')
  and listenart = 'haus'
)
with check (
  has_portal_area_access('zentrale')
  and listenart = 'haus'
);

drop policy if exists "Namensliste löschen" on public.einsatz_namensliste;
create policy "Namensliste löschen"
on public.einsatz_namensliste for delete
to authenticated
using (
  has_portal_area_access('zentrale')
  and listenart = 'haus'
);
