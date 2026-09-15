CREATE TABLE public.duty_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 duty_date date NOT NULL DEFAULT CURRENT_DATE,
 shift text NOT NULL DEFAULT 'tag' CHECK (shift IN ('tag','nacht')),
 function text NOT NULL CHECK (function IN ('zentrale','innendienst','jd','vd')),
 vehicle text CHECK (vehicle IS NULL OR length(vehicle)<=120),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,duty_date,shift)
);
CREATE INDEX duty_assignments_date_shift ON public.duty_assignments(duty_date,shift,function);
CREATE TRIGGER duty_assignments_updated_at BEFORE UPDATE ON public.duty_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.duty_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.duty_assignments FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.duty_assignments TO authenticated;
CREATE POLICY "Dienstbesetzung lesen" ON public.duty_assignments FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Eigene Dienstfunktion wählen" ON public.duty_assignments FOR INSERT TO authenticated
 WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_portal_area_access('zentrale'));
CREATE POLICY "Eigene Dienstfunktion ändern" ON public.duty_assignments FOR UPDATE TO authenticated
 USING (user_id=(SELECT auth.uid()) AND public.has_portal_area_access('zentrale'))
 WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_portal_area_access('zentrale'));
CREATE POLICY "Eigene Dienstfunktion entfernen" ON public.duty_assignments FOR DELETE TO authenticated
 USING (user_id=(SELECT auth.uid()) AND public.has_portal_area_access('zentrale'));

CREATE OR REPLACE FUNCTION public.is_zentralist_on_duty() RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.duty_assignments d
  WHERE d.user_id=(SELECT auth.uid()) AND d.duty_date=CURRENT_DATE AND d.function='zentrale'
 );
$$;
REVOKE ALL ON FUNCTION public.is_zentralist_on_duty() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_zentralist_on_duty() TO authenticated;

CREATE TABLE public.incident_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 caller_phone text CHECK (caller_phone IS NULL OR length(caller_phone)<=80),
 caller_name text CHECK (caller_name IS NULL OR length(caller_name)<=160),
 reported_at timestamptz NOT NULL DEFAULT now(),
 location text CHECK (location IS NULL OR length(location)<=240),
 summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 2000),
 involved_person text CHECK (involved_person IS NULL OR length(involved_person)<=160),
 involved_birth_date date,
 disposition text NOT NULL CHECK (disposition IN ('jd','vd','bp','keine_anfahrt')),
 note text CHECK (note IS NULL OR length(note)<=1000),
 status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','erledigt','weitergegeben')),
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (disposition<>'bp' OR status='weitergegeben')
);
CREATE INDEX incident_reports_recent ON public.incident_reports(reported_at DESC);
CREATE INDEX incident_reports_status ON public.incident_reports(status,reported_at DESC);
CREATE TRIGGER incident_reports_updated_at BEFORE UPDATE ON public.incident_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.incident_reports FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.incident_reports TO authenticated;
CREATE POLICY "Einsatzmeldungen lesen" ON public.incident_reports FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Zentralist erfasst Einsatzmeldungen" ON public.incident_reports FOR INSERT TO authenticated
 WITH CHECK ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND created_by=(SELECT auth.uid()));
CREATE POLICY "Zentralist bearbeitet Einsatzmeldungen" ON public.incident_reports FOR UPDATE TO authenticated
 USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
 WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
CREATE POLICY "Einsatzmeldungen nur durch Verwaltung löschen" ON public.incident_reports FOR DELETE TO authenticated
 USING (public.can_manage_zentrale());

CREATE TABLE public.operational_person_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 person_name text NOT NULL CHECK (length(trim(person_name)) BETWEEN 2 AND 160),
 birth_date date,
 phone text CHECK (phone IS NULL OR length(phone)<=80),
 category text NOT NULL CHECK (category IN ('infektionsschutz','aggressiv','waffenverbot','fluchtgefahr','suizidgefahr','sonstiges')),
 note text NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 1500),
 action_guidance text CHECK (action_guidance IS NULL OR length(action_guidance)<=1000),
 source_reference text CHECK (source_reference IS NULL OR length(source_reference)<=300),
 valid_until date,
 active boolean NOT NULL DEFAULT true,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX operational_person_notes_active_name ON public.operational_person_notes(lower(person_name)) WHERE active;
CREATE INDEX operational_person_notes_active_phone ON public.operational_person_notes(phone) WHERE active AND phone IS NOT NULL;
CREATE TRIGGER operational_person_notes_updated_at BEFORE UPDATE ON public.operational_person_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.operational_person_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.operational_person_notes FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.operational_person_notes TO authenticated;
CREATE POLICY "Operative Personenhinweise lesen" ON public.operational_person_notes FOR SELECT TO authenticated
 USING ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND active AND (valid_until IS NULL OR valid_until>=CURRENT_DATE));
CREATE POLICY "Operative Personenhinweise anlegen" ON public.operational_person_notes FOR INSERT TO authenticated
 WITH CHECK (public.can_manage_zentrale() AND created_by=(SELECT auth.uid()));
CREATE POLICY "Operative Personenhinweise ändern" ON public.operational_person_notes FOR UPDATE TO authenticated
 USING (public.can_manage_zentrale()) WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Operative Personenhinweise löschen" ON public.operational_person_notes FOR DELETE TO authenticated
 USING (public.can_manage_zentrale());
