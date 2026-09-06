-- Parkaufsicht-Liste (Owner): nur die genannten DNs/Namen.
-- Bekleidung bleibt Benutzer — keine höheren Rollen hier setzen.

UPDATE public.profiles p
SET organisation = 'Parkaufsicht'
WHERE p.organisation IS DISTINCT FROM 'Parkaufsicht'
  AND ltrim(trim(COALESCE(p.dienstnummer, '')), '0') IN ('40', '50', '55', '65', '70', '75', '90', '95')
  AND (
    p.name ILIKE '%fässler%'
    OR p.name ILIKE '%faessler%'
    OR p.name ILIKE '%fitz%'
    OR p.name ILIKE '%griß%'
    OR p.name ILIKE '%griss%'
    OR p.name ILIKE '%kalfa%'
    OR p.name ILIKE '%kusche%'
    OR p.name ILIKE '%mandracchia%'
    OR p.name ILIKE '%ploder%'
    OR p.name ILIKE '%schrotter%'
  );
