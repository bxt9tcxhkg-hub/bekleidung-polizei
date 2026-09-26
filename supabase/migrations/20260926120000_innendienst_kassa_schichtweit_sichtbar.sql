-- Bisher konnte im Innendienst pro Schicht nur die eigene Kassen-Bestätigung
-- gelesen werden (USING user_id=auth.uid() OR can_manage_zentrale()). Übernimmt
-- eine andere Person dieselbe Schicht, sah sie die bereits erfolgte
-- Abrechnung der/des Vorgängerin/Vorgängers nicht, weil deren Zeile für sie
-- unter RLS unsichtbar war - das Frontend fragt nur die eigene Zeile ab und
-- konnte fremde ohnehin nicht lesen. Ergänzt daher die Migration
-- 20260919070000 (Tagesfunktion statt Dauerberechtigung) konsequent: additiv
-- is_operative_duty_today(), wie bei den übrigen Innendienst-Leseregeln.
-- Zusätzlich auf duty_date=operational_today() begrenzt (statt die gesamte
-- Historie freizugeben) - is_operative_duty_today() prüft nur, ob heute
-- irgendeine Tagesfunktion (zentrale/innendienst/jd/vd) zugeteilt ist, nicht
-- den Bezug zur jeweiligen Zeile; ohne Datumsgrenze könnte damit jede/r mit
-- Tagesfunktion sämtliche vergangenen Kassenabrechnungen lesen.
alter policy "Schichtaufgaben lesen" on public.innendienst_shift_tasks
 using (user_id=(select auth.uid()) or public.can_manage_zentrale() or (public.is_operative_duty_today() and duty_date=public.operational_today()));
