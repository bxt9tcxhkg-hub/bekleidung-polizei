-- ZMR-Bewohnerdaten sind die Ausgangsbasis. Zentrale und diensthabende
-- Einsatzkräfte müssen daraus Evakuierungs- und Unterbringungslisten anlegen
-- und deren Arbeitsstand pflegen können. Die frühere Read-only-Policy ließ
-- irrtümlich ausschließlich Änderungen an der Hausliste zu.

drop policy if exists "Namensliste anlegen" on public.einsatz_namensliste;
create policy "Namensliste anlegen"
on public.einsatz_namensliste for insert
to authenticated
with check (
  (public.can_manage_zentrale() or public.is_operative_duty_today())
  and created_by = (select auth.uid())
);

drop policy if exists "Namensliste ändern" on public.einsatz_namensliste;
create policy "Namensliste ändern"
on public.einsatz_namensliste for update
to authenticated
using (public.can_manage_zentrale() or public.is_operative_duty_today())
with check (public.can_manage_zentrale() or public.is_operative_duty_today());

drop policy if exists "Namensliste löschen" on public.einsatz_namensliste;
create policy "Namensliste löschen"
on public.einsatz_namensliste for delete
to authenticated
using (public.can_manage_zentrale() or public.is_operative_duty_today());
