-- Beteiligte Parteien eines Einsatzes (Beschuldigter/Opfer/Zeuge/Sonstige),
-- getrennt vom Melder (incident_reports.caller_person_id). Erfasst wird beim
-- Weiterarbeiten mit einem bestehenden Einsatz, nicht beim Anlegen der
-- Meldung. Verweist auf dieselbe Person wie überall sonst im Zentrale-Bereich
-- (operational_persons) - dieselbe Person lässt sich später unverändert auch
-- als Gefährder/geschützte Person in einem Schutzfall (AV/BV & EV) verwenden,
-- ohne einen eigenen Datensatz doppelt anzulegen.
CREATE TABLE public.einsatz_parteien (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incident_reports(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.operational_persons(id) ON DELETE RESTRICT,
  rolle text NOT NULL CHECK (rolle IN ('beschuldigter','opfer','zeuge','sonstige')),
  note text CHECK (note IS NULL OR length(note)<=500),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(incident_id, person_id)
);
CREATE INDEX einsatz_parteien_incident_idx ON public.einsatz_parteien(incident_id);
CREATE INDEX einsatz_parteien_person_idx ON public.einsatz_parteien(person_id);

ALTER TABLE public.einsatz_parteien ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.einsatz_parteien FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.einsatz_parteien TO authenticated;
CREATE POLICY "Einsatzparteien lesen" ON public.einsatz_parteien FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Einsatzparteien erfassen" ON public.einsatz_parteien FOR INSERT TO authenticated
 WITH CHECK ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND created_by=(SELECT auth.uid()));
CREATE POLICY "Einsatzparteien ändern" ON public.einsatz_parteien FOR UPDATE TO authenticated
 USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
 WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
CREATE POLICY "Einsatzparteien löschen" ON public.einsatz_parteien FOR DELETE TO authenticated
 USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
