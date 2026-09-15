-- Fuhrpark-Unterlagen waren fuhrparkweit (wie Schulungen) organisiert, in der Praxis
-- geht dort aber vor allem die Zulassung hoch – die ist fahrzeugbezogen. Ersetzt durch
-- einen eigenen Reiter "Dokumente" direkt am Fahrzeug. Der fuhrparkweite Bereich wird
-- vollständig zurückgebaut (0 Zeilen vorhanden, keine Daten betroffen).

ALTER TABLE public.einsatz_material_tabs DROP CONSTRAINT IF EXISTS einsatz_material_tabs_area_check;
ALTER TABLE public.einsatz_material_tabs ADD CONSTRAINT einsatz_material_tabs_area_check
  CHECK (area IN ('einsatzmittel','einsatztraining','schulungen'));

DROP POLICY IF EXISTS "Unterlagen-Tabs lesen" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs lesen" ON public.einsatz_material_tabs FOR SELECT TO authenticated USING (
  CASE WHEN area='schulungen'
  THEN public.has_portal_area_access('schulungen') AND (active OR public.can_manage_schulungen())
  ELSE public.has_portal_area_access('einsatz_mt') AND (active OR public.can_manage_einsatzmittel()) END
);
DROP POLICY IF EXISTS "Unterlagen-Tabs anlegen" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs anlegen" ON public.einsatz_material_tabs FOR INSERT TO authenticated WITH CHECK (
  (area='schulungen' AND public.can_manage_schulungen())
  OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);
DROP POLICY IF EXISTS "Unterlagen-Tabs ändern" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs ändern" ON public.einsatz_material_tabs FOR UPDATE TO authenticated USING (
  (area='schulungen' AND public.can_manage_schulungen())
  OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
) WITH CHECK (
  (area='schulungen' AND public.can_manage_schulungen())
  OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);
DROP POLICY IF EXISTS "Unterlagen-Tabs löschen" ON public.einsatz_material_tabs;
CREATE POLICY "Unterlagen-Tabs löschen" ON public.einsatz_material_tabs FOR DELETE TO authenticated USING (
  (area='schulungen' AND public.can_manage_schulungen())
  OR (area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
);

DROP POLICY IF EXISTS "Einsatz-Unterlagen lesen" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen lesen" ON public.einsatz_materials FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
    (t.area='schulungen' AND public.has_portal_area_access('schulungen')
     AND (public.can_manage_schulungen() OR (t.active AND published AND archived_at IS NULL)))
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.has_portal_area_access('einsatz_mt')
     AND (public.can_manage_einsatzmittel() OR (t.active AND published AND archived_at IS NULL)))
  ))
);
DROP POLICY IF EXISTS "Einsatz-Unterlagen anlegen" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen anlegen" ON public.einsatz_materials FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND t.active AND (
    (t.area='schulungen' AND public.can_manage_schulungen())
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
  ))
);
DROP POLICY IF EXISTS "Einsatz-Unterlagen ändern" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen ändern" ON public.einsatz_materials FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
    (t.area='schulungen' AND public.can_manage_schulungen())
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
  ))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND t.active AND (
    (t.area='schulungen' AND public.can_manage_schulungen())
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
  ))
);
DROP POLICY IF EXISTS "Einsatz-Unterlagen löschen" ON public.einsatz_materials;
CREATE POLICY "Einsatz-Unterlagen löschen" ON public.einsatz_materials FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.einsatz_material_tabs t WHERE t.id=tab_id AND (
    (t.area='schulungen' AND public.can_manage_schulungen())
    OR (t.area IN ('einsatzmittel','einsatztraining') AND public.can_manage_einsatzmittel())
  ))
);

-- Fahrzeuggebundene Dokumente: Zulassung, Serviceheft usw. Flache Liste je Fahrzeug,
-- kein Kategorien-Konzept nötig (bereits über das Fahrzeug eindeutig zugeordnet).
CREATE TABLE public.fleet_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  file_key text NOT NULL CHECK (length(file_key)<=300),
  file_name text CHECK (file_name IS NULL OR length(file_name)<=255),
  mime_type text CHECK (mime_type IS NULL OR length(mime_type)<=120),
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fleet_documents_vehicle_idx ON public.fleet_documents(vehicle_id);

ALTER TABLE public.fleet_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_documents FROM PUBLIC,anon;
GRANT SELECT,INSERT,DELETE ON TABLE public.fleet_documents TO authenticated;
CREATE POLICY "Fahrzeugdokumente lesen" ON public.fleet_documents FOR SELECT TO authenticated
 USING (public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Fahrzeugdokumente anlegen" ON public.fleet_documents FOR INSERT TO authenticated
 WITH CHECK ((public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id)) AND uploaded_by=(SELECT auth.uid()));
CREATE POLICY "Fahrzeugdokumente löschen" ON public.fleet_documents FOR DELETE TO authenticated
 USING (public.can_manage_fuhrpark() OR public.is_vehicle_responsible(vehicle_id));
