-- Die SELECT-Policy verlangte bisher "active" auch für can_manage_zentrale(),
-- wodurch archivierte (inactive) Personenhinweise für Manager unsichtbar
-- blieben - auch server-seitig, nicht nur im bisherigen Client-Filter. Das
-- machte die Löschsperre in ZentralePersonen.tsx wirkungslos: eine Person mit
-- ausschließlich archivierten Hinweisen zeigte 0 Verknüpfungen und war löschbar,
-- wodurch die archivierten Hinweise durch das ON DELETE CASCADE auf
-- operational_person_notes.person_id endgültig verloren gingen. Manager sehen
-- jetzt auch archivierte Hinweise; für sonstige diensthabende Zentralisten
-- bleibt es bei ausschließlich aktiven Hinweisen (fachliche Entscheidung
-- unverändert).
drop policy "Operative Personenhinweise lesen" on public.operational_person_notes;
create policy "Operative Personenhinweise lesen" on public.operational_person_notes
  for select
  using (public.can_manage_zentrale() or (public.is_zentralist_on_duty() and active));
