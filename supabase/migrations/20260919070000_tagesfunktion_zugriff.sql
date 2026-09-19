-- Stufe 2 des Rechte-Umbaus (Audit-Punkt 4): Zugriff auf Zentrale/
-- Innendienst/Außendienst ist keine dauerhafte Berechtigung, sondern eine
-- TAGESFUNKTION aus der Diensteinteilung (duty_assignments) - jede/r
-- Benutzer/in der Stadtpolizei kann an einem Tag Zentrale, an einem anderen
-- Innendienst oder Außendienst (jd/vd) haben. is_zentralist_on_duty() deckte
-- bisher nur zentrale+innendienst ab; is_operative_duty_today() deckt jetzt
-- alle drei Tagesfunktionen ab und wird für LESEN zusätzlich zur bisherigen
-- has_portal_area_access('zentrale')-Prüfung verwendet (additiv, damit
-- niemand mit bestehender Dauerberechtigung etwas verliert). Schreibrechte
-- (is_zentralist_on_duty()-gesteuert) bleiben bewusst unverändert auf
-- zentrale+innendienst beschränkt - das ist eine separate Entscheidung.

create or replace function public.is_operative_duty_today()
returns boolean
language sql
stable
set search_path to ''
as $$
  select exists (
    select 1 from public.duty_assignments d
    where d.user_id = (select auth.uid()) and d.duty_date = public.operational_today()
      and d.function in ('zentrale', 'innendienst', 'jd', 'vd')
  );
$$;
grant execute on function public.is_operative_duty_today() to authenticated;

-- Die tägliche Funktionswahl selbst darf nicht an eine Dauerberechtigung
-- gebunden sein - sonst kann niemand ohne bestehende "zentrale"-Berechtigung
-- überhaupt zum ersten Mal eine Tagesfunktion wählen. Offen für jede/n
-- aktive/n Benutzer/in, nur die eigene Zeile.
drop policy "Dienstbesetzung lesen" on public.duty_assignments;
create policy "Dienstbesetzung lesen" on public.duty_assignments for select using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active));
drop policy "Eigene Dienstfunktion wählen" on public.duty_assignments;
create policy "Eigene Dienstfunktion wählen" on public.duty_assignments for insert with check (user_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active));
drop policy "Eigene Dienstfunktion ändern" on public.duty_assignments;
create policy "Eigene Dienstfunktion ändern" on public.duty_assignments for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy "Eigene Dienstfunktion entfernen" on public.duty_assignments;
create policy "Eigene Dienstfunktion entfernen" on public.duty_assignments for delete using (user_id = (select auth.uid()));

drop policy "Dienste lesen" on public.duty_functions;
create policy "Dienste lesen" on public.duty_functions for select using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active));

alter policy "Einsatzmeldungen lesen" on public.incident_reports using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Gebührenpositionen lesen" on public.innendienst_gebuehrenpositionen using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Gebührensätze lesen" on public.innendienst_gebuehrensaetze using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Gebührensatz-Positionen lesen" on public.innendienst_gebuehrensatz_positionen using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Innendienst-Protokoll lesen" on public.innendienst_records using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Personen lesen" on public.operational_persons using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Telefonnummern lesen" on public.operational_phone_numbers using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Einsatzparteien lesen" on public.einsatz_parteien using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Zentrale sieht Profile" on public.profiles using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Auftraggeber lesen" on public.strassenzustand_auftraggeber using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Straßenzustandsberichte lesen" on public.strassenzustand_berichte using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Straßenzustandszeilen lesen" on public.strassenzustand_berichtzeilen using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Melder lesen" on public.strassenzustand_melder using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Straßen lesen" on public.strassenzustand_strassen using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Fahrzeugchecks lesen" on public.vehicle_checks using (has_portal_area_access('zentrale') or has_portal_area_access('fuhrpark') or is_operative_duty_today());
alter policy "Checklisten-Punkte lesen" on public.einsatz_checklist_punkte using (has_portal_area_access('zentrale') or is_operative_duty_today());
alter policy "Namensliste lesen" on public.einsatz_namensliste using (has_portal_area_access('zentrale') or is_operative_duty_today());

alter policy "zentrale_alarmierung lesen" on public.zentrale_alarmierung using ((has_portal_area_access('zentrale') or is_operative_duty_today()) and ((not restricted) or can_manage_zentrale() or is_zentralist_on_duty()));
alter policy "zentrale_av_bv lesen" on public.zentrale_av_bv using ((has_portal_area_access('zentrale') or is_operative_duty_today()) and ((not restricted) or can_manage_zentrale() or is_zentralist_on_duty()));
alter policy "Baustellen lesen" on public.zentrale_baustellen using ((has_portal_area_access('zentrale') or is_operative_duty_today()) and ((not restricted) or can_manage_zentrale()));
alter policy "Zentrale Einträge lesen" on public.zentrale_entries using ((has_portal_area_access('zentrale') or is_operative_duty_today()) and ((not restricted) or can_manage_zentrale()));
alter policy "zentrale_fahndungen lesen" on public.zentrale_fahndungen using ((has_portal_area_access('zentrale') or has_portal_area_access('datenpflege') or is_operative_duty_today()) and ((not restricted) or can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty()));
alter policy "zentrale_kontakte lesen" on public.zentrale_kontakte using ((has_portal_area_access('zentrale') or has_portal_area_access('datenpflege') or is_operative_duty_today()) and ((not restricted) or can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty()));
alter policy "zentrale_schluessel lesen" on public.zentrale_schluessel using ((has_portal_area_access('zentrale') or has_portal_area_access('datenpflege') or is_operative_duty_today()) and ((not restricted) or can_manage_zentrale() or can_manage_datenpflege() or is_zentralist_on_duty()));
alter policy "zentrale_unterlagen lesen" on public.zentrale_unterlagen using ((has_portal_area_access('zentrale') or is_operative_duty_today()) and ((not restricted) or can_manage_zentrale() or is_zentralist_on_duty()));
alter policy "wichtige_telefonnummern lesen" on public.wichtige_telefonnummern using (has_portal_area_access('zentrale') or has_portal_area_access('datenpflege') or is_operative_duty_today());

alter policy "Objekte lesen" on public.operational_objects using (has_portal_area_access('zentrale') or has_portal_area_access('datenpflege') or is_operative_duty_today());
alter policy "Objekte anlegen" on public.operational_objects with check ((has_portal_area_access('zentrale') or has_portal_area_access('datenpflege') or is_operative_duty_today()) and created_by = (select auth.uid()));
alter policy "Personen anlegen" on public.operational_persons with check ((has_portal_area_access('zentrale') or is_operative_duty_today()) and created_by = (select auth.uid()));
