-- Portal Phase 2b: Pool-Einsatzmittel und Verwahrungsorte.
-- Gleiches Modell wie persönliche EM: eine Tabelle, category-Enum +
-- typisierte nullable Spalten. Verwahrungsort als CHECK-Lookup
-- (Lager, Innendienst, Peter 1, Peter 2, Peter 30) — keine Extra-Tabelle.
-- Lagerbestand ist keine eigene Tabelle (UI aggregiert Anzahl/Zeilen).
-- Rechte über bestehende has_portal_area_access / can_manage_einsatzmittel
-- (einsatz_mt: Lesen jede Rolle; Schreiben SB/Admin) plus globales Admin.
-- Bekleidungs-RLS bleibt unverändert. Persönliche EM unverändert.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

-- Spalten je Kategorie (übrige NULL; Client setzt ungenutzte Felder zurück):
--   langwaffe_stg77:      marke, typ, waffennummer, kaliber, verwahrungsort
--   magazine:             anzahl, verwahrungsort
--   munition:             marke, typ, art, anzahl (UI: Menge), verwahrungsort
--   pfefferspray_gross:   marke, anzahl, ablaufdatum, verwahrungsort
--   schild:               marke, anzahl, verwahrungsort
--   ballistischer_helm:   ablaufdatum, anzahl, verwahrungsort
--   schwere_westen:       marke, anzahl, groessen, ablaufdatum, verwahrungsort
--   spuckschutzhaube:     anzahl, verwahrungsort
CREATE TABLE IF NOT EXISTS public.pool_einsatzmittel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'langwaffe_stg77',
    'magazine',
    'munition',
    'pfefferspray_gross',
    'schild',
    'ballistischer_helm',
    'schwere_westen',
    'spuckschutzhaube'
  )),
  verwahrungsort text NOT NULL CHECK (verwahrungsort IN (
    'lager',
    'innendienst',
    'peter_1',
    'peter_2',
    'peter_30'
  )),
  marke text,
  typ text,
  waffennummer text,
  kaliber text,
  art text,
  anzahl integer,
  groessen text,
  ablaufdatum date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id),
  CONSTRAINT pool_em_anzahl_nonneg CHECK (anzahl IS NULL OR anzahl >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pool_em_category
  ON public.pool_einsatzmittel (category);

CREATE INDEX IF NOT EXISTS idx_pool_em_verwahrungsort
  ON public.pool_einsatzmittel (verwahrungsort);

CREATE INDEX IF NOT EXISTS idx_pool_em_category_ort
  ON public.pool_einsatzmittel (category, verwahrungsort);

DROP TRIGGER IF EXISTS pool_einsatzmittel_updated_at ON public.pool_einsatzmittel;
CREATE TRIGGER pool_einsatzmittel_updated_at
  BEFORE UPDATE ON public.pool_einsatzmittel
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.pool_einsatzmittel ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pool_einsatzmittel FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pool_einsatzmittel TO authenticated;

DROP POLICY IF EXISTS "Pool-Einsatzmittel lesen" ON public.pool_einsatzmittel;
CREATE POLICY "Pool-Einsatzmittel lesen" ON public.pool_einsatzmittel
  FOR SELECT TO authenticated
  USING (has_portal_area_access('einsatz_mt'));

DROP POLICY IF EXISTS "Pool-Einsatzmittel schreiben" ON public.pool_einsatzmittel;
CREATE POLICY "Pool-Einsatzmittel schreiben" ON public.pool_einsatzmittel
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Pool-Einsatzmittel ändern" ON public.pool_einsatzmittel;
CREATE POLICY "Pool-Einsatzmittel ändern" ON public.pool_einsatzmittel
  FOR UPDATE TO authenticated
  USING (can_manage_einsatzmittel())
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Pool-Einsatzmittel löschen" ON public.pool_einsatzmittel;
CREATE POLICY "Pool-Einsatzmittel löschen" ON public.pool_einsatzmittel
  FOR DELETE TO authenticated
  USING (can_manage_einsatzmittel());
