CREATE TABLE public.duty_functions (
 code text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{1,40}$'),
 label text NOT NULL UNIQUE CHECK (length(trim(label)) BETWEEN 1 AND 80),
 is_patrol boolean NOT NULL DEFAULT false,
 standard_staffing integer CHECK (standard_staffing IS NULL OR standard_staffing BETWEEN 1 AND 20),
 active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER duty_functions_updated_at BEFORE UPDATE ON public.duty_functions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
INSERT INTO public.duty_functions(code,label,is_patrol,standard_staffing,sort_order) VALUES
 ('zentrale','Zentrale',false,1,10),('innendienst','Innendienst',false,1,20),
 ('jd','Journaldienst (JD)',true,2,30),('vd','Verkehrsdienst (VD)',true,NULL,40);

ALTER TABLE public.duty_functions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.duty_functions FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.duty_functions TO authenticated;
CREATE POLICY "Dienste lesen" ON public.duty_functions FOR SELECT TO authenticated USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Dienste anlegen" ON public.duty_functions FOR INSERT TO authenticated WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Dienste ändern" ON public.duty_functions FOR UPDATE TO authenticated USING (public.can_manage_zentrale()) WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Dienste löschen" ON public.duty_functions FOR DELETE TO authenticated USING (public.can_manage_zentrale());

ALTER TABLE public.duty_assignments DROP CONSTRAINT duty_assignments_function_check;
ALTER TABLE public.duty_assignments ADD COLUMN vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL;
CREATE INDEX duty_assignments_vehicle_id_idx ON public.duty_assignments(vehicle_id);

DROP POLICY "Fuhrpark Fahrzeuge lesen" ON public.fleet_vehicles;
CREATE POLICY "Fuhrpark Fahrzeuge lesen" ON public.fleet_vehicles FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark') OR (active AND public.has_portal_area_access('zentrale')));
