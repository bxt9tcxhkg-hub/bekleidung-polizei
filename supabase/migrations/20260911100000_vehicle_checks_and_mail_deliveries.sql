-- Fahrzeug-/Materialcheck vor Dienstbeginn (Außendienst-Cockpit) und
-- strukturierte RSa/RSb-Übersicht je Person mit Schnellaktionen.

CREATE TABLE public.vehicle_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  duty_date date NOT NULL DEFAULT CURRENT_DATE,
  shift text NOT NULL DEFAULT 'tag' CHECK (shift IN ('tag','nacht')),
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','mangel')),
  note text CHECK (note IS NULL OR length(note)<=1000),
  checked_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(vehicle_id,duty_date,shift)
);
CREATE INDEX vehicle_checks_date_idx ON public.vehicle_checks(duty_date DESC);
CREATE TRIGGER vehicle_checks_updated_at BEFORE UPDATE ON public.vehicle_checks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.vehicle_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vehicle_checks FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.vehicle_checks TO authenticated;
CREATE POLICY "Fahrzeugchecks lesen" ON public.vehicle_checks FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale') OR public.has_portal_area_access('fuhrpark'));
CREATE POLICY "Fahrzeugcheck erfassen" ON public.vehicle_checks FOR INSERT TO authenticated
 WITH CHECK (public.has_portal_area_access('zentrale') AND checked_by=(SELECT auth.uid()));
CREATE POLICY "Fahrzeugcheck ändern" ON public.vehicle_checks FOR UPDATE TO authenticated
 USING (public.has_portal_area_access('zentrale') AND (checked_by=(SELECT auth.uid()) OR public.can_manage_zentrale() OR public.can_manage_fuhrpark()))
 WITH CHECK (public.has_portal_area_access('zentrale'));
CREATE POLICY "Fahrzeugcheck löschen" ON public.vehicle_checks FOR DELETE TO authenticated
 USING (public.can_manage_zentrale() OR public.can_manage_fuhrpark());

-- RSa/RSb: Übersicht wird im UI nach Person gruppiert; die Tabelle bleibt flach je Sendung.
CREATE TABLE public.mail_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_name text NOT NULL CHECK (length(trim(person_name)) BETWEEN 2 AND 160),
  person_birth_date date,
  kind text NOT NULL CHECK (kind IN ('rsa','rsb')),
  behoerden_aktenzahl text CHECK (behoerden_aktenzahl IS NULL OR length(behoerden_aktenzahl)<=120),
  eigene_geschaeftszahl text CHECK (eigene_geschaeftszahl IS NULL OR length(eigene_geschaeftszahl)<=120),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','zugestellt','schriftlich_in_kenntnis','nicht_angetroffen','spaeter_erneut')),
  note text CHECK (note IS NULL OR length(note)<=1000),
  akteneigentuemer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_action_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_action_at timestamptz,
  owner_notified boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mail_deliveries_person_idx ON public.mail_deliveries(lower(person_name));
CREATE INDEX mail_deliveries_status_idx ON public.mail_deliveries(status) WHERE status<>'zugestellt';
CREATE INDEX mail_deliveries_owner_idx ON public.mail_deliveries(akteneigentuemer_id) WHERE NOT owner_notified;
CREATE TRIGGER mail_deliveries_updated_at BEFORE UPDATE ON public.mail_deliveries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.mail_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mail_deliveries FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.mail_deliveries TO authenticated;
CREATE POLICY "RSa/RSb lesen" ON public.mail_deliveries FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "RSa/RSb anlegen" ON public.mail_deliveries FOR INSERT TO authenticated
 WITH CHECK (public.has_portal_area_access('zentrale') AND created_by=(SELECT auth.uid()));
CREATE POLICY "RSa/RSb bearbeiten" ON public.mail_deliveries FOR UPDATE TO authenticated
 USING (public.has_portal_area_access('zentrale')) WITH CHECK (public.has_portal_area_access('zentrale'));
CREATE POLICY "RSa/RSb löschen" ON public.mail_deliveries FOR DELETE TO authenticated
 USING (public.can_manage_zentrale());

-- Schnellaktion: Status setzen, Zeit/Bearbeiter automatisch, Eigentümer als unbenachrichtigt markieren.
CREATE OR REPLACE FUNCTION public.record_mail_delivery_action(p_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF p_status NOT IN ('zugestellt','schriftlich_in_kenntnis','nicht_angetroffen','spaeter_erneut') THEN
    RAISE EXCEPTION 'Ungültiger Status';
  END IF;
  IF NOT public.has_portal_area_access('zentrale') THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  UPDATE public.mail_deliveries
  SET status=p_status, last_action_by=(SELECT auth.uid()), last_action_at=now(), owner_notified=false
  WHERE id=p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sendung nicht gefunden';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_mail_delivery_action(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_mail_delivery_action(uuid,text) TO authenticated;
