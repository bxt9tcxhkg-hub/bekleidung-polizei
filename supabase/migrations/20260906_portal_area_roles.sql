-- Portal Phase 1: Bereichsrechte.
-- Modell: eine Zeile pro (user_id, area) mit roles text[].
--   bekleidung: mehrere Rollen (user, sachbearbeiter, genehmiger, admin),
--               Dual-Write mit profiles.roles (bestehende Bekleidungs-RLS / has_role unverändert).
--   einsatz_mt: genau eine Rolle (user | sachbearbeiter | admin), kein Genehmiger.
--               user = Leserecht für spätere EM-UI. Keine Inventar-/Termin-Tabellen.
-- Backfill: profiles.roles → bekleidung; aktive Profile erhalten einsatz_mt = user.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

CREATE TABLE IF NOT EXISTS public.portal_area_roles (
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('bekleidung', 'einsatz_mt')),
  roles text[] NOT NULL DEFAULT ARRAY['user']::text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, area),
  CONSTRAINT portal_area_roles_roles_not_empty CHECK (cardinality(roles) >= 1),
  CONSTRAINT portal_area_roles_roles_valid CHECK (
    (area = 'bekleidung' AND roles <@ ARRAY['user', 'sachbearbeiter', 'genehmiger', 'admin']::text[])
    OR
    (area = 'einsatz_mt' AND roles <@ ARRAY['user', 'sachbearbeiter', 'admin']::text[])
  ),
  CONSTRAINT portal_area_roles_einsatz_single CHECK (
    area <> 'einsatz_mt' OR cardinality(roles) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_portal_area_roles_area
  ON public.portal_area_roles (area);

ALTER TABLE public.portal_area_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.normalize_bekleidung_roles(src text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      ARRAY(
        SELECT s.role
        FROM (
          SELECT
            CASE WHEN r = 'approver' THEN 'genehmiger' ELSE r END AS role,
            MIN(CASE
              WHEN r = 'user' THEN 0
              WHEN r = 'sachbearbeiter' THEN 1
              WHEN r IN ('genehmiger', 'approver') THEN 2
              WHEN r = 'admin' THEN 3
              ELSE 9
            END) AS rank
          FROM unnest(COALESCE(src, ARRAY[]::text[])) AS r
          WHERE r IN ('user', 'sachbearbeiter', 'genehmiger', 'admin', 'approver')
          GROUP BY 1
        ) AS s
        ORDER BY s.rank
      ),
      ARRAY[]::text[]
    ),
    ARRAY['user']::text[]
  );
$$;

CREATE OR REPLACE FUNCTION public.sync_portal_bekleidung_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bekleidung_roles text[];
BEGIN
  IF NEW.roles IS NULL OR cardinality(NEW.roles) = 0 THEN
    DELETE FROM public.portal_area_roles
    WHERE user_id = NEW.id AND area = 'bekleidung';
  ELSE
    bekleidung_roles := public.normalize_bekleidung_roles(NEW.roles);
    INSERT INTO public.portal_area_roles (user_id, area, roles)
    VALUES (NEW.id, 'bekleidung', bekleidung_roles)
    ON CONFLICT (user_id, area) DO UPDATE
      SET roles = EXCLUDED.roles,
          updated_at = now()
      WHERE public.portal_area_roles.roles IS DISTINCT FROM EXCLUDED.roles;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.active IS TRUE THEN
    INSERT INTO public.portal_area_roles (user_id, area, roles)
    VALUES (NEW.id, 'einsatz_mt', ARRAY['user']::text[])
    ON CONFLICT (user_id, area) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS portal_area_roles_from_profile ON public.profiles;
CREATE TRIGGER portal_area_roles_from_profile
  AFTER INSERT OR UPDATE OF roles ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_portal_bekleidung_from_profile();

DROP TRIGGER IF EXISTS portal_area_roles_updated_at ON public.portal_area_roles;
CREATE TRIGGER portal_area_roles_updated_at
  BEFORE UPDATE ON public.portal_area_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

REVOKE ALL ON FUNCTION public.normalize_bekleidung_roles(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_portal_bekleidung_from_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_bekleidung_roles(text[]) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_area_roles TO authenticated;

DROP POLICY IF EXISTS "Bereichsrechte lesen" ON public.portal_area_roles;
CREATE POLICY "Bereichsrechte lesen" ON public.portal_area_roles
  FOR SELECT TO authenticated
  USING (has_role('admin') OR user_id = auth.uid());

DROP POLICY IF EXISTS "Admin schreibt Bereichsrechte" ON public.portal_area_roles;
CREATE POLICY "Admin schreibt Bereichsrechte" ON public.portal_area_roles
  FOR ALL TO authenticated
  USING (has_role('admin'))
  WITH CHECK (has_role('admin'));

-- Backfill Bekleidung aus profiles.roles (auch inaktive Profile).
INSERT INTO public.portal_area_roles (user_id, area, roles)
SELECT
  p.id,
  'bekleidung',
  public.normalize_bekleidung_roles(p.roles)
FROM public.profiles p
ON CONFLICT (user_id, area) DO NOTHING;

-- Backfill Einsatzmittel & Training: Leserecht für alle aktiven Profile.
INSERT INTO public.portal_area_roles (user_id, area, roles)
SELECT
  p.id,
  'einsatz_mt',
  ARRAY['user']::text[]
FROM public.profiles p
WHERE p.active IS TRUE
ON CONFLICT (user_id, area) DO NOTHING;
