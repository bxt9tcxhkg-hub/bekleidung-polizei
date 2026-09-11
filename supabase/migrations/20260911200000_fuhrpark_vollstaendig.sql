-- Fuhrpark & Fahrzeuge vollständig: alle bisher als "In Planung" markierten
-- Arbeitsbereiche der Fahrzeug-Detailseite werden funktionsfähig.
--   Fahrzeugkontrolle       -> bestehende Tabelle vehicle_checks, jetzt auch für
--                              reine Fuhrpark-Mitglieder (nicht nur Zentrale) nutzbar
--   Bestand & Füllliste     -> fleet_equipment_items (Soll) + fleet_equipment_status (Ist)
--   Offene Mängel           -> abgeleitet aus fleet_equipment_status (status <> vollstaendig)
--   Reinigung & Pflege      -> fleet_care_tasks
--   Werkstatt & Termine     -> fleet_appointments (category='werkstatt')
--   Fristen                 -> fleet_appointments (category='frist')
-- Der/die Fahrzeugverantwortliche (fleet_vehicles.responsible_user_id) darf für das
-- eigene Fahrzeug mitverwalten, nicht nur Fuhrpark-Sachbearbeiter/Admin.

CREATE OR REPLACE FUNCTION public.is_vehicle_responsible(p_vehicle_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_vehicles v WHERE v.id=p_vehicle_id AND v.responsible_user_id=(SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_vehicle_responsible(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_vehicle_responsible(uuid) TO authenticated;

-- Fahrzeugkontrolle: bisher nur für Zentrale-Mitglieder erfassbar, jetzt auch für Fuhrpark.
DROP POLICY IF EXISTS "Fahrzeugcheck erfassen" ON public.vehicle_checks;
CREATE POLICY "Fahrzeugcheck erfassen" ON public.vehicle_checks FOR INSERT TO authenticated
 WITH CHECK ((public.has_portal_area_access('zentrale') OR public.has_portal_area_access('fuhrpark')) AND checked_by=(SELECT auth.uid()));
DROP POLICY IF EXISTS "Fahrzeugcheck ändern" ON public.vehicle_checks;
CREATE POLICY "Fahrzeugcheck ändern" ON public.vehicle_checks FOR UPDATE TO authenticated
 USING ((public.has_portal_area_access('zentrale') OR public.has_portal_area_access('fuhrpark')) AND (checked_by=(SELECT auth.uid()) OR public.can_manage_zentrale() OR public.can_manage_fuhrpark()))
 WITH CHECK (public.has_portal_area_access('zentrale') OR public.has_portal_area_access('fuhrpark'));

-- Bestand & Füllliste: Soll-Katalog je Fahrzeug.
CREATE TABLE public.fleet_equipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  soll_menge integer NOT NULL DEFAULT 1 CHECK (soll_menge >= 0),
  unit text NOT NULL DEFAULT 'Stück' CHECK (length(unit)<=30),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_equipment_items_vehicle_idx ON public.fleet_equipment_items(vehicle_id) WHERE active;
CREATE TRIGGER fleet_equipment_items_updated_at BEFORE UPDATE ON public.fleet_equipment_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fleet_equipment_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_equipment_items FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.fleet_equipment_items TO authenticated;
CREATE POLICY "Fülllisten-Positionen lesen" ON public.fleet_equipment_items FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Fülllisten-Positionen anlegen" ON public.fleet_equipment_items FOR INSERT TO authenticated
 WITH CHECK (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));
CREATE POLICY "Fülllisten-Positionen ändern" ON public.fleet_equipment_items FOR UPDATE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id))
 WITH CHECK (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));
CREATE POLICY "Fülllisten-Positionen löschen" ON public.fleet_equipment_items FOR DELETE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));

-- Aktueller Ist-Zustand je Position (eine Zeile pro Position, wird bei jeder Kontrolle überschrieben).
-- Fehlt eine Zeile, gilt die Position als "ungeprüft".
CREATE TABLE public.fleet_equipment_status (
  item_id uuid PRIMARY KEY REFERENCES public.fleet_equipment_items(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  ist_menge integer CHECK (ist_menge IS NULL OR ist_menge >= 0),
  status text NOT NULL DEFAULT 'vollstaendig' CHECK (status IN ('vollstaendig','fehlend','beschaedigt','abgelaufen')),
  note text CHECK (note IS NULL OR length(note)<=500),
  checked_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_equipment_status_open_idx ON public.fleet_equipment_status(vehicle_id) WHERE status<>'vollstaendig';
CREATE TRIGGER fleet_equipment_status_updated_at BEFORE UPDATE ON public.fleet_equipment_status FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fleet_equipment_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_equipment_status FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.fleet_equipment_status TO authenticated;
CREATE POLICY "Fülllisten-Status lesen" ON public.fleet_equipment_status FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Fülllisten-Status erfassen" ON public.fleet_equipment_status FOR INSERT TO authenticated
 WITH CHECK (public.has_portal_area_access('fuhrpark') AND checked_by=(SELECT auth.uid()));
CREATE POLICY "Fülllisten-Status ändern" ON public.fleet_equipment_status FOR UPDATE TO authenticated
 USING (public.has_portal_area_access('fuhrpark'))
 WITH CHECK (public.has_portal_area_access('fuhrpark') AND checked_by=(SELECT auth.uid()));
CREATE POLICY "Fülllisten-Status löschen" ON public.fleet_equipment_status FOR DELETE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));

-- Reinigung & Pflege: offene Aufgaben je Fahrzeug.
CREATE TABLE public.fleet_care_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'sonstiges' CHECK (kind IN ('innenreinigung','aussenreinigung','pflege','sonstiges')),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 200),
  note text CHECK (note IS NULL OR length(note)<=1000),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','erledigt')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_care_tasks_open_idx ON public.fleet_care_tasks(vehicle_id) WHERE status='offen';
CREATE TRIGGER fleet_care_tasks_updated_at BEFORE UPDATE ON public.fleet_care_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fleet_care_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_care_tasks FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.fleet_care_tasks TO authenticated;
CREATE POLICY "Pflegeaufgaben lesen" ON public.fleet_care_tasks FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Pflegeaufgaben anlegen" ON public.fleet_care_tasks FOR INSERT TO authenticated
 WITH CHECK (public.has_portal_area_access('fuhrpark') AND created_by=(SELECT auth.uid()));
CREATE POLICY "Pflegeaufgaben ändern" ON public.fleet_care_tasks FOR UPDATE TO authenticated
 USING (public.has_portal_area_access('fuhrpark')) WITH CHECK (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Pflegeaufgaben löschen" ON public.fleet_care_tasks FOR DELETE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));

-- Werkstatt & Termine sowie Fristen: gleiche Struktur, per category unterschieden.
CREATE TABLE public.fleet_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('werkstatt','frist')),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 200),
  due_date date,
  note text CHECK (note IS NULL OR length(note)<=1000),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','erledigt','storniert')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_appointments_open_idx ON public.fleet_appointments(vehicle_id, due_date) WHERE status='offen';
CREATE TRIGGER fleet_appointments_updated_at BEFORE UPDATE ON public.fleet_appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.fleet_appointments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_appointments FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.fleet_appointments TO authenticated;
CREATE POLICY "Fahrzeugtermine lesen" ON public.fleet_appointments FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Fahrzeugtermine anlegen" ON public.fleet_appointments FOR INSERT TO authenticated
 WITH CHECK ((public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id)) AND created_by=(SELECT auth.uid()));
CREATE POLICY "Fahrzeugtermine ändern" ON public.fleet_appointments FOR UPDATE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id))
 WITH CHECK (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));
CREATE POLICY "Fahrzeugtermine löschen" ON public.fleet_appointments FOR DELETE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));

-- Unterlagen: Fuhrpark als weiterer Unterlagenbereich (analog Schulungen).
ALTER TABLE public.einsatz_material_tabs DROP CONSTRAINT IF EXISTS einsatz_material_tabs_area_check;
ALTER TABLE public.einsatz_material_tabs ADD CONSTRAINT einsatz_material_tabs_area_check
  CHECK (area IN ('einsatzmittel','einsatztraining','schulungen','fuhrpark'));

DROP POLICY IF EXISTS "Unterlagen-Tabs lesen" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs lesen" ON public.einsatz_material_tabs FOR SELECT TO authenticated USING (
  CASE
    WHEN area='schulungen' THEN public.has_portal_area_access('schulungen') AND (active OR public.can_manage_schulungen())
    WHEN area='fuhrpark' THEN public.has_portal_area_access('fuhrpark') AND (active OR public.can_manage_fuhrpark())
    ELSE public.has_portal_area_access('einsatz_mt') AND (active OR public.can_manage_einsatzmittel())
  END
);
DROP POLICY IF EXISTS "Unterlagen-Tabs anlegen" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs anlegen" ON public.einsatz_material_tabs FOR INSERT TO authenticated WITH CHECK (
  (area='schulungen' AND public.can_manage_schulungen())
  OR (area='fuhrpark' AND public.can_manage_fuhrpark())
  OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);
DROP POLICY IF EXISTS "Unterlagen-Tabs ändern" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs ändern" ON public.einsatz_material_tabs FOR UPDATE TO authenticated USING (
  (area='schulungen' AND public.can_manage_schulungen())
  OR (area='fuhrpark' AND public.can_manage_fuhrpark())
  OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
) WITH CHECK (
  (area='schulungen' AND public.can_manage_schulungen())
  OR (area='fuhrpark' AND public.can_manage_fuhrpark())
  OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);
DROP POLICY IF EXISTS "Unterlagen-Tabs löschen" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs löschen" ON public.einsatz_material_tabs FOR DELETE TO authenticated USING (
  (area='schulungen' AND public.can_manage_schulungen())
  OR (area='fuhrpark' AND public.can_manage_fuhrpark())
  OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);

DROP POLICY IF EXISTS "Einsatz-Unterlagen lesen" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen lesen" ON public.einsatz_materials FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
    (t.area='schulungen' AND public.has_portal_area_access('schulungen')
     AND (public.can_manage_schulungen() OR (t.active AND published AND archived_at IS NULL)))
    OR (t.area='fuhrpark' AND public.has_portal_area_access('fuhrpark')
     AND (public.can_manage_fuhrpark() OR (t.active AND published AND archived_at IS NULL)))
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.has_portal_area_access('einsatz_mt')
     AND (public.can_manage_einsatzmittel() OR (t.active AND published AND archived_at IS NULL)))
  ))
);
DROP POLICY IF EXISTS "Einsatz-Unterlagen anlegen" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen anlegen" ON public.einsatz_materials FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND t.active AND (
    (t.area='schulungen' AND public.can_manage_schulungen())
    OR (t.area='fuhrpark' AND public.can_manage_fuhrpark())
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
  ))
);
DROP POLICY IF EXISTS "Einsatz-Unterlagen ändern" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen ändern" ON public.einsatz_materials FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
    (t.area='schulungen' AND public.can_manage_schulungen())
    OR (t.area='fuhrpark' AND public.can_manage_fuhrpark())
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
  ))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND t.active AND (
    (t.area='schulungen' AND public.can_manage_schulungen())
    OR (t.area='fuhrpark' AND public.can_manage_fuhrpark())
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
  ))
);
DROP POLICY IF EXISTS "Einsatz-Unterlagen löschen" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen löschen" ON public.einsatz_materials FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
    (t.area='schulungen' AND public.can_manage_schulungen())
    OR (t.area='fuhrpark' AND public.can_manage_fuhrpark())
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
  ))
);
