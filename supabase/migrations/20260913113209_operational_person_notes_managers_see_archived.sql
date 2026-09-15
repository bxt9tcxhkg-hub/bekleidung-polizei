drop policy "Operative Personenhinweise lesen" on public.operational_person_notes;
create policy "Operative Personenhinweise lesen" on public.operational_person_notes
  for select
  using (public.can_manage_zentrale() or (public.is_zentralist_on_duty() and active));
