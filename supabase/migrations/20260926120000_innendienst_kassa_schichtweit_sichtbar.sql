-- Bisher konnte im Innendienst pro Schicht nur die eigene Kassen-Bestätigung
-- gelesen werden (USING user_id=auth.uid() OR can_manage_zentrale()). Übernimmt
-- eine andere Person dieselbe Schicht, sah sie die bereits erfolgte
-- Abrechnung der/des Vorgängerin/Vorgängers nicht, weil deren Zeile für sie
-- unter RLS unsichtbar war - das Frontend fragt nur die eigene Zeile ab und
-- konnte fremde ohnehin nicht lesen.
--
-- is_operative_duty_today() alleine wäre hier zu grob: die Funktion prüft
-- nur, ob heute irgendeine Tagesfunktion (zentrale/innendienst/jd/vd)
-- zugeteilt ist, ohne Bezug zu duty_date/shift der jeweiligen Zeile - damit
-- könnte z. B. ein Streifenbeamter im JD/VD-Dienst oder jemand mit
-- Zentrale-Funktion an einem anderen Tag jede Kassenabrechnung aller Tage
-- und Schichten lesen. Stattdessen ein eigener, parametrisierter Helfer
-- (analog has_portal_area_access('<bereich>')): nur wer laut
-- Diensteinteilung an genau diesem duty_date in genau dieser Schicht
-- Innendienst hat, bekommt zusätzlich zur eigenen Zeile auch die der/des
-- Vorgängerin/Vorgängers zu sehen. duty_assignments bleibt als
-- Diensteinteilungshistorie dauerhaft bestehen (kein Aufräumen alter
-- Zeilen) - ohne zusätzliche Begrenzung auf den aktuellen Diensttag würde
-- jede eigene vergangene Innendienst-Zuteilung dauerhaft als Schlüssel für
-- die Kassenzeilen desselben Tages/derselben Schicht aller Kolleg/innen
-- dienen, weit über die eigentliche Schichtübernahme hinaus.
create or replace function public.is_innendienst_shift_duty(p_duty_date date, p_shift text)
returns boolean
language sql
stable
set search_path to ''
as $$
  select exists (
    select 1 from public.duty_assignments d
    where d.user_id=(select auth.uid())
      and d.function='innendienst'
      and d.duty_date=public.operational_today()
      and d.duty_date=p_duty_date
      and d.shift=p_shift
  );
$$;
grant execute on function public.is_innendienst_shift_duty(date, text) to authenticated;

alter policy "Schichtaufgaben lesen" on public.innendienst_shift_tasks
 using (
   user_id=(select auth.uid())
   or public.can_manage_zentrale()
   or public.is_innendienst_shift_duty(duty_date, shift)
 );
