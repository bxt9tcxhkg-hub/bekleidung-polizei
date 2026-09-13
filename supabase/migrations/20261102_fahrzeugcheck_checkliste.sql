-- Fahrzeugcheck: eigene, verwaltbare Checkliste für den Fahrzeugzustand
-- (Reifen, Beleuchtung, Ölstand, Sauberkeit, ...) - analog zur Bestand &
-- Füllliste (fleet_equipment_items/-status), aber unabhängig davon: die
-- Füllliste prüft mitgeführte Ausstattung (Soll-/Ist-Menge je Position),
-- der Fahrzeugcheck den Fahrzeugzustand selbst (nur in Ordnung/Mangel je
-- Position, keine Menge). Ergänzt die bestehende schnelle Tages-/Schicht-
-- Kontrolle (vehicle_checks, auch von Außendienst genutzt), ersetzt sie nicht.

CREATE TABLE public.fleet_check_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_check_items_vehicle_idx ON public.fleet_check_items(vehicle_id) WHERE active;
CREATE TRIGGER fleet_check_items_updated_at BEFORE UPDATE ON public.fleet_check_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fleet_check_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_check_items FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.fleet_check_items TO authenticated;
CREATE POLICY "Fahrzeugcheck-Positionen lesen" ON public.fleet_check_items FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Fahrzeugcheck-Positionen anlegen" ON public.fleet_check_items FOR INSERT TO authenticated
 WITH CHECK (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));
CREATE POLICY "Fahrzeugcheck-Positionen ändern" ON public.fleet_check_items FOR UPDATE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id))
 WITH CHECK (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));
CREATE POLICY "Fahrzeugcheck-Positionen löschen" ON public.fleet_check_items FOR DELETE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));

-- Aktueller Ist-Zustand je Position (eine Zeile pro Position, wird bei jeder Kontrolle überschrieben).
-- Fehlt eine Zeile, gilt die Position als "ungeprüft".
CREATE TABLE public.fleet_check_item_status (
  item_id uuid PRIMARY KEY REFERENCES public.fleet_check_items(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','mangel')),
  note text CHECK (note IS NULL OR length(note)<=500),
  checked_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_check_item_status_open_idx ON public.fleet_check_item_status(vehicle_id) WHERE status<>'ok';
CREATE TRIGGER fleet_check_item_status_updated_at BEFORE UPDATE ON public.fleet_check_item_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fleet_check_item_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_check_item_status FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.fleet_check_item_status TO authenticated;
CREATE POLICY "Fahrzeugcheck-Status lesen" ON public.fleet_check_item_status FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Fahrzeugcheck-Status erfassen" ON public.fleet_check_item_status FOR INSERT TO authenticated
 WITH CHECK (public.has_portal_area_access('fuhrpark') AND checked_by=(SELECT auth.uid()));
CREATE POLICY "Fahrzeugcheck-Status ändern" ON public.fleet_check_item_status FOR UPDATE TO authenticated
 USING (public.has_portal_area_access('fuhrpark'))
 WITH CHECK (public.has_portal_area_access('fuhrpark') AND checked_by=(SELECT auth.uid()));
CREATE POLICY "Fahrzeugcheck-Status löschen" ON public.fleet_check_item_status FOR DELETE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));
