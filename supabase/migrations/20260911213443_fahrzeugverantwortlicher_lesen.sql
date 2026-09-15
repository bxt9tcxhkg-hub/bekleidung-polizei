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
