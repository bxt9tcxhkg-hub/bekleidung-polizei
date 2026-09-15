-- Abgelaufene Personenhinweise (valid_until in der Vergangenheit) sollen laut
-- fachlicher Entscheidung weiterhin sichtbar bleiben (mit "Abgelaufen"-Hinweis
-- in der UI) - der Zentralist urteilt selbst, statt dass sie automatisch aus
-- der RLS-Sicht verschwinden.
drop policy "Operative Personenhinweise lesen" on public.operational_person_notes;

create policy "Operative Personenhinweise lesen" on public.operational_person_notes
  for select
  using ((can_manage_zentrale() OR is_zentralist_on_duty()) AND active);
