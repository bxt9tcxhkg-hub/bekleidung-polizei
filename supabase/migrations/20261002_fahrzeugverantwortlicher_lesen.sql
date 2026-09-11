-- Lücke im Berechtigungsmodell: die Schreib-Policies auf fleet_vehicles/
-- fleet_equipment_status/fleet_care_tasks/fleet_appointments erlauben schon
-- can_manage_fuhrpark() ODER is_vehicle_responsible(vehicle_id), die Lese-
-- Policies aber bisher nur has_portal_area_access('fuhrpark') — ein/e
-- Fahrzeugverantwortliche/r ohne eigene Fuhrpark-Bereichsrolle könnte also
-- schreiben, aber vorher nicht lesen. In der Praxis hat aktuell jede/r
-- Fahrzeugverantwortliche zusätzlich eine Fuhrpark-Rolle, das Portal-Widget
-- "Mein Fahrzeug" soll aber unabhängig davon zuverlässig funktionieren.

DROP POLICY IF EXISTS "Fuhrpark Fahrzeuge lesen" ON public.fleet_vehicles;
CREATE POLICY "Fuhrpark Fahrzeuge lesen" ON public.fleet_vehicles FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark') OR (active AND public.has_portal_area_access('zentrale')) OR public.is_vehicle_responsible(id));

DROP POLICY IF EXISTS "Fülllisten-Status lesen" ON public.fleet_equipment_status;
CREATE POLICY "Fülllisten-Status lesen" ON public.fleet_equipment_status FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark') OR public.is_vehicle_responsible(vehicle_id));

DROP POLICY IF EXISTS "Pflegeaufgaben lesen" ON public.fleet_care_tasks;
CREATE POLICY "Pflegeaufgaben lesen" ON public.fleet_care_tasks FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark') OR public.is_vehicle_responsible(vehicle_id));

DROP POLICY IF EXISTS "Fahrzeugtermine lesen" ON public.fleet_appointments;
CREATE POLICY "Fahrzeugtermine lesen" ON public.fleet_appointments FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark') OR public.is_vehicle_responsible(vehicle_id));
