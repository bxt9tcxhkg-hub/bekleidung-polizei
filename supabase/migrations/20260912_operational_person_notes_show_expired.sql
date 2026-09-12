-- Abgelaufene Personenhinweise (valid_until in der Vergangenheit) sollen laut
-- fachlicher Entscheidung weiterhin sichtbar bleiben (mit "Abgelaufen"-Hinweis
-- in der UI) - der Zentralist urteilt selbst, statt dass sie automatisch aus
-- der RLS-Sicht verschwinden.
DROP POLICY "Operative Personenhinweise lesen" ON public.operational_person_notes;

CREATE POLICY "Operative Personenhinweise lesen" ON public.operational_person_notes
  FOR SELECT
  USING ((can_manage_zentrale() OR is_zentralist_on_duty()) AND active);
