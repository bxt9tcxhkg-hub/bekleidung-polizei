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
-- und Schichten lesen. Stattdessen korreliert die Policy direkt gegen
-- duty_assignments: nur wer laut Diensteinteilung an genau diesem duty_date
-- in genau dieser Schicht Innendienst hat, bekommt zusätzlich zur eigenen
-- Zeile auch die der/des Vorgängerin/Vorgängers zu sehen.
alter policy "Schichtaufgaben lesen" on public.innendienst_shift_tasks
 using (
   user_id=(select auth.uid())
   or public.can_manage_zentrale()
   or exists (
     select 1 from public.duty_assignments d
     where d.user_id=(select auth.uid())
       and d.function='innendienst'
       and d.duty_date=innendienst_shift_tasks.duty_date
       and d.shift=innendienst_shift_tasks.shift
   )
 );
