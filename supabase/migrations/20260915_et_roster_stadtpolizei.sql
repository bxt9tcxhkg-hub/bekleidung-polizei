-- ET-/Zuteilungsliste: alle bekannten Offiziere sind Stadtpolizei
-- (Stadtpolizei Dornbirn). Parkaufsicht kommt als eigene Liste später.
-- Nur Seed-DNs/Namen anpassen — bestehende Parkaufsicht-Profile nicht pauschal umhängen.

UPDATE public.profiles p
SET organisation = 'Stadtpolizei'
WHERE p.organisation IS DISTINCT FROM 'Stadtpolizei'
  AND (
    ltrim(trim(COALESCE(p.dienstnummer, '')), '0') IN ('1', '7', '18', '32', '37')
    OR p.name ILIKE '%schwendinger%'
    OR (p.name ILIKE '%fenkart%' AND p.name ILIKE '%matthias%')
    OR p.name ILIKE '%petternel%'
    OR (p.name ILIKE '%albrecht%' AND p.name ILIKE '%stefanie%')
    OR p.name ILIKE '%soyucok%'
  );
