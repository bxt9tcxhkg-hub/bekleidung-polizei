-- Straßenzustand: digitale Abbildung des bisherigen Word-Formulars
-- ("Straßenzustandsbericht_Automation.dotm"). Ein Bericht kann mehrere
-- Straßen bündeln (wie im alten Makro per "Gesamtentscheid"); pro Straße
-- wird automatisch aus dem letzten bekannten Zustand abgeleitet, ob es sich
-- um einen Neuzugang, eine Änderung oder einen Widerruf handelt.

-- ===== Admin-editierbare Stammdaten =====
CREATE TABLE public.strassenzustand_strassen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.strassenzustand_auftraggeber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.strassenzustand_melder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER strassenzustand_strassen_updated_at BEFORE UPDATE ON public.strassenzustand_strassen FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER strassenzustand_auftraggeber_updated_at BEFORE UPDATE ON public.strassenzustand_auftraggeber FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER strassenzustand_melder_updated_at BEFORE UPDATE ON public.strassenzustand_melder FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.strassenzustand_strassen(name, sort_order) VALUES ('Ebniterstraße', 10), ('Kehleggerstraße', 20), ('Furt', 30);
INSERT INTO public.strassenzustand_auftraggeber(name, sort_order) VALUES ('BH Dornbirn', 10), ('Lawinenwarndienst', 20);
INSERT INTO public.strassenzustand_melder(name, sort_order) VALUES ('Dreher', 10), ('Meixner', 20);

ALTER TABLE public.strassenzustand_strassen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strassenzustand_auftraggeber ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strassenzustand_melder ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.strassenzustand_strassen FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.strassenzustand_auftraggeber FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.strassenzustand_melder FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.strassenzustand_strassen TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.strassenzustand_auftraggeber TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.strassenzustand_melder TO authenticated;

CREATE POLICY "Straßen lesen" ON public.strassenzustand_strassen FOR SELECT TO authenticated USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Straßen verwalten (insert)" ON public.strassenzustand_strassen FOR INSERT TO authenticated WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Straßen verwalten (update)" ON public.strassenzustand_strassen FOR UPDATE TO authenticated USING (public.can_manage_zentrale()) WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Straßen verwalten (delete)" ON public.strassenzustand_strassen FOR DELETE TO authenticated USING (public.can_manage_zentrale());

CREATE POLICY "Auftraggeber lesen" ON public.strassenzustand_auftraggeber FOR SELECT TO authenticated USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Auftraggeber verwalten (insert)" ON public.strassenzustand_auftraggeber FOR INSERT TO authenticated WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Auftraggeber verwalten (update)" ON public.strassenzustand_auftraggeber FOR UPDATE TO authenticated USING (public.can_manage_zentrale()) WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Auftraggeber verwalten (delete)" ON public.strassenzustand_auftraggeber FOR DELETE TO authenticated USING (public.can_manage_zentrale());

CREATE POLICY "Melder lesen" ON public.strassenzustand_melder FOR SELECT TO authenticated USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Melder verwalten (insert)" ON public.strassenzustand_melder FOR INSERT TO authenticated WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Melder verwalten (update)" ON public.strassenzustand_melder FOR UPDATE TO authenticated USING (public.can_manage_zentrale()) WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Melder verwalten (delete)" ON public.strassenzustand_melder FOR DELETE TO authenticated USING (public.can_manage_zentrale());

-- ===== Berichte (ein PDF, kann mehrere Straßen umfassen) =====
CREATE TABLE public.strassenzustand_berichte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nummer bigint GENERATED ALWAYS AS IDENTITY,
  bearbeiter uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  anmerkung text CHECK (anmerkung IS NULL OR length(anmerkung) <= 2000),
  pdf_file_key text,
  pdf_file_name text,
  pdf_uploaded_at timestamptz,
  pdf_uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER strassenzustand_berichte_updated_at BEFORE UPDATE ON public.strassenzustand_berichte FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ===== Berichtzeilen (pro Straße innerhalb eines Berichts) =====
CREATE TABLE public.strassenzustand_berichtzeilen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bericht_id uuid NOT NULL REFERENCES public.strassenzustand_berichte(id) ON DELETE CASCADE,
  strasse_id uuid REFERENCES public.strassenzustand_strassen(id) ON DELETE RESTRICT,
  strasse_freitext text CHECK (strasse_freitext IS NULL OR length(trim(strasse_freitext)) BETWEEN 1 AND 120),
  zustand text NOT NULL CHECK (zustand IN ('normal','schnee','glatteis','lawine','sonstige')),
  zustand_freitext text CHECK (zustand_freitext IS NULL OR length(zustand_freitext) <= 1000),
  auftraggeber_id uuid REFERENCES public.strassenzustand_auftraggeber(id) ON DELETE SET NULL,
  auftraggeber_freitext text CHECK (auftraggeber_freitext IS NULL OR length(trim(auftraggeber_freitext)) <= 200),
  melder_id uuid REFERENCES public.strassenzustand_melder(id) ON DELETE SET NULL,
  melder_freitext text CHECK (melder_freitext IS NULL OR length(trim(melder_freitext)) <= 200),
  gueltig_von date NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis date,
  -- Wird von einem Trigger gesetzt (siehe unten) - Client-Werte werden ignoriert.
  meldungsart text NOT NULL DEFAULT 'neuzugang' CHECK (meldungsart IN ('neuzugang','aenderung','widerruf')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (strasse_id IS NOT NULL OR strasse_freitext IS NOT NULL),
  CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_von)
);
CREATE INDEX strassenzustand_berichtzeilen_bericht_idx ON public.strassenzustand_berichtzeilen(bericht_id);
CREATE INDEX strassenzustand_berichtzeilen_strasse_idx ON public.strassenzustand_berichtzeilen(strasse_id, created_at DESC);

-- Meldungsart automatisch aus dem letzten bekannten Zustand derselben Straße
-- ableiten (Neuzugang/Änderung/Widerruf) - wie im alten Makro, aber
-- serverseitig statt in einer lokalen History-Datei.
CREATE OR REPLACE FUNCTION public.strassenzustand_compute_meldungsart() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  prev_zustand text;
BEGIN
  SELECT z.zustand INTO prev_zustand
  FROM public.strassenzustand_berichtzeilen z
  WHERE (NEW.strasse_id IS NOT NULL AND z.strasse_id = NEW.strasse_id)
     OR (NEW.strasse_id IS NULL AND z.strasse_id IS NULL AND lower(trim(z.strasse_freitext)) = lower(trim(NEW.strasse_freitext)))
  ORDER BY z.created_at DESC
  LIMIT 1;

  IF NEW.zustand = 'normal' THEN
    NEW.meldungsart := 'widerruf';
  ELSIF prev_zustand IS NULL OR prev_zustand = 'normal' THEN
    NEW.meldungsart := 'neuzugang';
  ELSE
    NEW.meldungsart := 'aenderung';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER strassenzustand_berichtzeilen_meldungsart BEFORE INSERT ON public.strassenzustand_berichtzeilen
FOR EACH ROW EXECUTE FUNCTION public.strassenzustand_compute_meldungsart();

ALTER TABLE public.strassenzustand_berichte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strassenzustand_berichtzeilen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.strassenzustand_berichte FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.strassenzustand_berichtzeilen FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.strassenzustand_berichte TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.strassenzustand_berichtzeilen TO authenticated;

CREATE POLICY "Straßenzustandsberichte lesen" ON public.strassenzustand_berichte FOR SELECT TO authenticated USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Straßenzustandsberichte anlegen" ON public.strassenzustand_berichte FOR INSERT TO authenticated WITH CHECK (public.can_manage_zentrale() AND bearbeiter = (SELECT auth.uid()));
CREATE POLICY "Straßenzustandsberichte ändern" ON public.strassenzustand_berichte FOR UPDATE TO authenticated USING (public.can_manage_zentrale()) WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Straßenzustandsberichte löschen" ON public.strassenzustand_berichte FOR DELETE TO authenticated USING (public.can_manage_zentrale());

CREATE POLICY "Straßenzustandszeilen lesen" ON public.strassenzustand_berichtzeilen FOR SELECT TO authenticated USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Straßenzustandszeilen anlegen" ON public.strassenzustand_berichtzeilen FOR INSERT TO authenticated WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Straßenzustandszeilen ändern" ON public.strassenzustand_berichtzeilen FOR UPDATE TO authenticated USING (public.can_manage_zentrale()) WITH CHECK (public.can_manage_zentrale());
CREATE POLICY "Straßenzustandszeilen löschen" ON public.strassenzustand_berichtzeilen FOR DELETE TO authenticated USING (public.can_manage_zentrale());
