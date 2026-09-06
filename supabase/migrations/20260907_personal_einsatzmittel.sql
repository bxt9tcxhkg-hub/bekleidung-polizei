-- Portal Phase 2a: Persönliche Einsatzmittel (nur personenbezogen).
-- Ein Tabelle, category-Enum + typisierte nullable Spalten je Kategorie.
-- Kein Pool, kein Lager, kein Einsatztraining, kein Genehmiger.
-- Rechte über portal_area_roles.einsatz_mt (Lesen: jede Rolle; Schreiben: SB/Admin)
-- plus globales has_role('admin'). Bekleidungs-RLS bleibt unverändert.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

CREATE OR REPLACE FUNCTION public.has_portal_area_role(p_area text, p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.portal_area_roles r ON r.user_id = p.id
    WHERE p.id = auth.uid()
      AND p.active IS TRUE
      AND r.area = p_area
      AND p_role = ANY (r.roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_portal_area_access(p_area text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role('admin')
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.portal_area_roles r ON r.user_id = p.id
      WHERE p.id = auth.uid()
        AND p.active IS TRUE
        AND r.area = p_area
        AND cardinality(r.roles) >= 1
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_einsatzmittel()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role('admin')
    OR public.has_portal_area_role('einsatz_mt', 'sachbearbeiter')
    OR public.has_portal_area_role('einsatz_mt', 'admin');
$$;

REVOKE ALL ON FUNCTION public.has_portal_area_role(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_portal_area_access(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_einsatzmittel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_portal_area_role(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_portal_area_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_einsatzmittel() TO authenticated;

-- Spalten je Kategorie (übrige NULL; Client setzt ungenutzte Felder zurück):
--   schutzweste:          officer_id, groesse, ablaufdatum, schutzfristen
--   glock_17:             officer_id, waffennummer, service, magazinanzahl
--   munition:             officer_id, marke, kaliber, art, patronen
--   pfefferspray:         officer_id, ablauf_mm_yyyy
--   schlagstock:          officer_id
--   handfesseln:          officer_id
--   taschenlampe_kelle:   officer_id, marke  (UI: Marke/Type)
--   leatherman:           officer_id, marke  (UI: Marke/Type)
--   warnweste:            officer_id, marke, groesse
CREATE TABLE IF NOT EXISTS public.personal_einsatzmittel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN (
    'schutzweste',
    'glock_17',
    'munition',
    'pfefferspray',
    'schlagstock',
    'handfesseln',
    'taschenlampe_kelle',
    'leatherman',
    'warnweste'
  )),
  officer_id uuid NOT NULL REFERENCES public.profiles (id),
  groesse text,
  ablaufdatum date,
  schutzfristen text,
  waffennummer text,
  service text,
  magazinanzahl integer,
  marke text,
  kaliber text,
  art text,
  patronen integer,
  ablauf_mm_yyyy text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id),
  CONSTRAINT personal_em_magazinanzahl_nonneg CHECK (magazinanzahl IS NULL OR magazinanzahl >= 0),
  CONSTRAINT personal_em_patronen_nonneg CHECK (patronen IS NULL OR patronen >= 0),
  CONSTRAINT personal_em_ablauf_mm_yyyy_format CHECK (
    ablauf_mm_yyyy IS NULL OR ablauf_mm_yyyy ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_personal_em_officer
  ON public.personal_einsatzmittel (officer_id);

CREATE INDEX IF NOT EXISTS idx_personal_em_category
  ON public.personal_einsatzmittel (category);

DROP TRIGGER IF EXISTS personal_einsatzmittel_updated_at ON public.personal_einsatzmittel;
CREATE TRIGGER personal_einsatzmittel_updated_at
  BEFORE UPDATE ON public.personal_einsatzmittel
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.personal_einsatzmittel ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.personal_einsatzmittel FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_einsatzmittel TO authenticated;

DROP POLICY IF EXISTS "Einsatzmittel lesen" ON public.personal_einsatzmittel;
CREATE POLICY "Einsatzmittel lesen" ON public.personal_einsatzmittel
  FOR SELECT TO authenticated
  USING (has_portal_area_access('einsatz_mt'));

DROP POLICY IF EXISTS "Einsatzmittel schreiben" ON public.personal_einsatzmittel;
CREATE POLICY "Einsatzmittel schreiben" ON public.personal_einsatzmittel
  FOR INSERT TO authenticated
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatzmittel ändern" ON public.personal_einsatzmittel;
CREATE POLICY "Einsatzmittel ändern" ON public.personal_einsatzmittel
  FOR UPDATE TO authenticated
  USING (can_manage_einsatzmittel())
  WITH CHECK (can_manage_einsatzmittel());

DROP POLICY IF EXISTS "Einsatzmittel löschen" ON public.personal_einsatzmittel;
CREATE POLICY "Einsatzmittel löschen" ON public.personal_einsatzmittel
  FOR DELETE TO authenticated
  USING (can_manage_einsatzmittel());

-- Officer-Namen in der EM-Liste: Bereichsberechtigte dürfen Profile lesen.
-- Additive Policy, bestehende Bekleidungs-Policies bleiben.
DROP POLICY IF EXISTS "Einsatzmittel-Bereich sieht Profile" ON public.profiles;
CREATE POLICY "Einsatzmittel-Bereich sieht Profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (has_portal_area_access('einsatz_mt'));
