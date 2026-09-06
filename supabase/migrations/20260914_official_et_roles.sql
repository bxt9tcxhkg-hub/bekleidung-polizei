-- Offizielle ET-Module (Petternel-Verzeichnis 2026-09-06),
-- Owner-Rollenmatrix nach Dienstnummer, idempotent.
-- Persönliche Zuteilung kommt über Admin-Import (JSON/CSV), nicht als
-- erfundene Offizierszeilen. Live-DB wird vom Agent nicht angewandt.

INSERT INTO public.einsatz_training_modules (name, kind, active)
VALUES
  ('Combat', 'extern', true),
  ('Internes ET', 'intern', true),
  ('Stockschulung TS-Einsatzstock', 'intern', true),
  ('Erste Hilfe COMBAT', 'extern', true),
  ('Szenarientraining', 'intern', true),
  ('Fahrsicherheitstraining', 'extern', true)
ON CONFLICT ((lower(trim(name))), kind) DO UPDATE
  SET active = true,
      name = EXCLUDED.name,
      updated_at = now();

-- Rollenmatrix: nur vorhandene Profile, keine Neuanlage.
-- DN 1 Genehmiger, DN 7 + 32 Bekleidung-SB (Fenkart, nicht Wiesner),
-- DN 18 Einsatz-SB, DN 37 Admin nicht herabstufen.
-- Übrige aktive Profile: Bekleidung Benutzer + einsatz_mt Benutzer.

UPDATE public.profiles p
SET roles = ARRAY['user', 'genehmiger']::text[]
WHERE NOT ('admin' = ANY (COALESCE(p.roles, ARRAY[]::text[])))
  AND (
    ltrim(trim(COALESCE(p.dienstnummer, '')), '0') = '1'
    OR p.name ILIKE '%schwendinger%'
  );

UPDATE public.profiles p
SET roles = ARRAY['user', 'sachbearbeiter']::text[]
WHERE NOT ('admin' = ANY (COALESCE(p.roles, ARRAY[]::text[])))
  AND (
    ltrim(trim(COALESCE(p.dienstnummer, '')), '0') = '32'
    OR (p.name ILIKE '%albrecht%' AND p.name ILIKE '%stefanie%')
  );

UPDATE public.profiles p
SET roles = ARRAY['user', 'sachbearbeiter']::text[]
WHERE NOT ('admin' = ANY (COALESCE(p.roles, ARRAY[]::text[])))
  AND (
    ltrim(trim(COALESCE(p.dienstnummer, '')), '0') = '7'
    OR (p.name ILIKE '%fenkart%' AND p.name ILIKE '%matthias%')
  )
  AND p.name NOT ILIKE '%wiesner%';

UPDATE public.profiles p
SET roles = ARRAY['user']::text[]
WHERE NOT ('admin' = ANY (COALESCE(p.roles, ARRAY[]::text[])))
  AND (
    ltrim(trim(COALESCE(p.dienstnummer, '')), '0') = '18'
    OR p.name ILIKE '%petternel%'
  );

UPDATE public.profiles p
SET roles = ARRAY['user']::text[]
WHERE p.active IS TRUE
  AND NOT ('admin' = ANY (COALESCE(p.roles, ARRAY[]::text[])))
  AND ltrim(trim(COALESCE(p.dienstnummer, '')), '0') NOT IN ('1', '7', '32', '18', '37')
  AND p.name NOT ILIKE '%schwendinger%'
  AND p.name NOT ILIKE '%fenkart%'
  AND NOT (p.name ILIKE '%albrecht%' AND p.name ILIKE '%stefanie%')
  AND p.name NOT ILIKE '%petternel%'
  AND p.name NOT ILIKE '%soyucok%';

INSERT INTO public.portal_area_roles (user_id, area, roles)
SELECT p.id, 'einsatz_mt', ARRAY['sachbearbeiter']::text[]
FROM public.profiles p
WHERE p.active IS TRUE
  AND (
    ltrim(trim(COALESCE(p.dienstnummer, '')), '0') = '18'
    OR p.name ILIKE '%petternel%'
  )
ON CONFLICT (user_id, area) DO UPDATE
  SET roles = EXCLUDED.roles,
      updated_at = now();

INSERT INTO public.portal_area_roles (user_id, area, roles)
SELECT p.id, 'einsatz_mt', ARRAY['user']::text[]
FROM public.profiles p
WHERE p.active IS TRUE
  AND NOT ('admin' = ANY (COALESCE(p.roles, ARRAY[]::text[])))
  AND ltrim(trim(COALESCE(p.dienstnummer, '')), '0') IS DISTINCT FROM '18'
  AND p.name NOT ILIKE '%petternel%'
  AND p.name NOT ILIKE '%soyucok%'
ON CONFLICT (user_id, area) DO UPDATE
  SET roles = EXCLUDED.roles,
      updated_at = now()
  WHERE public.portal_area_roles.roles IS DISTINCT FROM ARRAY['admin']::text[];
