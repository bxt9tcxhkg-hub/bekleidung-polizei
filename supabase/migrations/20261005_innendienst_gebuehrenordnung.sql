-- Innendienst: Gebührenordnung als reine Referenztabelle. Innendienst selbst
-- braucht keine gesonderten Genehmiger-Aktionen, aber die Gebühren-Positionen
-- (z. B. Bundesabgabe, Verwaltungsgebühr, Beiblatt) und deren Zusammensetzung
-- zu benannten Sätzen (z. B. "Bescheid Straßenmusik") legt ausschließlich der
-- Genehmiger fest. Der Innendienst schlägt hier nur nach, welcher Betrag für
-- einen Bescheid o. ä. zusammenkommt; es wird kein Betrag an einem konkreten
-- innendienst_records-Eintrag gespeichert (bewusst weiterhin ohne Gebühren,
-- siehe 20260911110000_innendienst_cockpit.sql).

CREATE TABLE public.innendienst_gebuehrenpositionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 120),
  betrag numeric(10,2) NOT NULL CHECK (betrag >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

CREATE TABLE public.innendienst_gebuehrensaetze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id)
);

CREATE TABLE public.innendienst_gebuehrensatz_positionen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gebuehrensatz_id uuid NOT NULL REFERENCES public.innendienst_gebuehrensaetze(id) ON DELETE CASCADE,
  position_id uuid NOT NULL REFERENCES public.innendienst_gebuehrenpositionen(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gebuehrensatz_id, position_id)
);

CREATE INDEX innendienst_gebuehrensatz_positionen_satz_idx ON public.innendienst_gebuehrensatz_positionen (gebuehrensatz_id);
CREATE INDEX innendienst_gebuehrensatz_positionen_position_idx ON public.innendienst_gebuehrensatz_positionen (position_id);

DROP TRIGGER IF EXISTS innendienst_gebuehrenpositionen_updated_at ON public.innendienst_gebuehrenpositionen;
CREATE TRIGGER innendienst_gebuehrenpositionen_updated_at
  BEFORE UPDATE ON public.innendienst_gebuehrenpositionen
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS innendienst_gebuehrensaetze_updated_at ON public.innendienst_gebuehrensaetze;
CREATE TRIGGER innendienst_gebuehrensaetze_updated_at
  BEFORE UPDATE ON public.innendienst_gebuehrensaetze
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.innendienst_gebuehrenpositionen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.innendienst_gebuehrensaetze ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.innendienst_gebuehrensatz_positionen ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.innendienst_gebuehrenpositionen FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.innendienst_gebuehrensaetze FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.innendienst_gebuehrensatz_positionen FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.innendienst_gebuehrenpositionen TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.innendienst_gebuehrensaetze TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.innendienst_gebuehrensatz_positionen TO authenticated;

-- Lesen: jeder mit Zugriff auf den operativen Bereich (Zentrale/Innendienst/
-- Außendienst/RSa-RSb teilen sich die Bereichsrolle 'zentrale').
CREATE POLICY "Gebührenpositionen lesen" ON public.innendienst_gebuehrenpositionen FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Gebührensätze lesen" ON public.innendienst_gebuehrensaetze FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale'));
CREATE POLICY "Gebührensatz-Positionen lesen" ON public.innendienst_gebuehrensatz_positionen FOR SELECT TO authenticated
 USING (public.has_portal_area_access('zentrale'));

-- Schreiben: bewusst dem Genehmiger vorbehalten, nicht dem allgemeinen
-- Zentrale/Innendienst-Sachbearbeiter (can_manage_zentrale()) - Innendienst
-- selbst hat hier keine eigene Verwaltungsrolle, siehe Migrationskommentar.
CREATE POLICY "Gebührenpositionen anlegen" ON public.innendienst_gebuehrenpositionen FOR INSERT TO authenticated
 WITH CHECK (public.is_genehmiger());
CREATE POLICY "Gebührenpositionen ändern" ON public.innendienst_gebuehrenpositionen FOR UPDATE TO authenticated
 USING (public.is_genehmiger()) WITH CHECK (public.is_genehmiger());
CREATE POLICY "Gebührenpositionen löschen" ON public.innendienst_gebuehrenpositionen FOR DELETE TO authenticated
 USING (public.is_genehmiger());

CREATE POLICY "Gebührensätze anlegen" ON public.innendienst_gebuehrensaetze FOR INSERT TO authenticated
 WITH CHECK (public.is_genehmiger());
CREATE POLICY "Gebührensätze ändern" ON public.innendienst_gebuehrensaetze FOR UPDATE TO authenticated
 USING (public.is_genehmiger()) WITH CHECK (public.is_genehmiger());
CREATE POLICY "Gebührensätze löschen" ON public.innendienst_gebuehrensaetze FOR DELETE TO authenticated
 USING (public.is_genehmiger());

CREATE POLICY "Gebührensatz-Positionen anlegen" ON public.innendienst_gebuehrensatz_positionen FOR INSERT TO authenticated
 WITH CHECK (public.is_genehmiger());
CREATE POLICY "Gebührensatz-Positionen löschen" ON public.innendienst_gebuehrensatz_positionen FOR DELETE TO authenticated
 USING (public.is_genehmiger());
