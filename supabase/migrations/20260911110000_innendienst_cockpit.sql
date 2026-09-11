-- Innendienst-Cockpit: Kassen-Bestätigung je Schicht sowie ein einfaches Protokoll für
-- Bescheide (Straßenmusik/Straßenkunst) und zu prüfende Verstöße. Bewusst als schlankes
-- Protokoll (Betreff, Status, Bezug) gehalten – keine Abbildung von Bescheidinhalten,
-- Gebühren oder Fristen, da dafür eine fachliche Abstimmung mit der Dienststelle nötig ist.

CREATE TABLE public.innendienst_shift_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  duty_date date NOT NULL DEFAULT CURRENT_DATE,
  shift text NOT NULL DEFAULT 'tag' CHECK (shift IN ('tag','nacht')),
  kasse_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,duty_date,shift)
);
CREATE TRIGGER innendienst_shift_tasks_updated_at BEFORE UPDATE ON public.innendienst_shift_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.innendienst_shift_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.innendienst_shift_tasks FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.innendienst_shift_tasks TO authenticated;
CREATE POLICY "Schichtaufgaben lesen" ON public.innendienst_shift_tasks FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR public.can_manage_zentrale());
CREATE POLICY "Schichtaufgaben anlegen" ON public.innendienst_shift_tasks FOR INSERT TO authenticated
 WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_portal_area_access('zentrale'));
CREATE POLICY "Schichtaufgaben ändern" ON public.innendienst_shift_tasks FOR UPDATE TO authenticated
 USING (user_id=(SELECT auth.uid()) AND public.has_portal_area_access('zentrale'))
 WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_portal_area_access('zentrale'));
CREATE POLICY "Schichtaufgaben löschen" ON public.innendienst_shift_tasks FOR DELETE TO authenticated
 USING (public.can_manage_zentrale());

CREATE TABLE public.innendienst_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('bescheid_strassenmusik','bescheid_strassenkunst','verstoss')),
  reference text CHECK (reference IS NULL OR length(reference)<=160),
  subject text NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 200),
  note text CHECK (note IS NULL OR length(note)<=2000),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','erledigt')),
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX innendienst_records_date_idx ON public.innendienst_records(issued_date DESC,kind);
CREATE INDEX innendienst_records_open_idx ON public.innendienst_records(kind) WHERE status='offen';
CREATE TRIGGER innendienst_records_updated_at BEFORE UPDATE ON public.innendienst_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.innendienst_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.innendienst_records FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.innendienst_records TO authenticated;
CREATE POLICY "Innendienst-Protokoll lesen" ON public.innendienst_records FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Innendienst-Protokoll anlegen" ON public.innendienst_records FOR INSERT TO authenticated
 WITH CHECK (public.has_portal_area_access('zentrale') AND created_by=(SELECT auth.uid()));
CREATE POLICY "Innendienst-Protokoll ändern" ON public.innendienst_records FOR UPDATE TO authenticated
 USING (public.has_portal_area_access('zentrale')) WITH CHECK (public.has_portal_area_access('zentrale'));
CREATE POLICY "Innendienst-Protokoll löschen" ON public.innendienst_records FOR DELETE TO authenticated
 USING (public.can_manage_zentrale());
