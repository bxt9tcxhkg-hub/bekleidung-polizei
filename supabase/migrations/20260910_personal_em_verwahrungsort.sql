-- Persönliche Einsatzmittel: optionaler Officer + Verwahrungsort.
-- Owner 2026-09-06: persönliche EM können im Lager liegen (z. B. nach
-- Austritt). Officer darf dann leer sein. Mehrere Stücke derselben
-- Kategorie mit unterschiedlicher Waffennummer sind zulässig — kein
-- Unique auf (category, verwahrungsort) oder waffennummer.
-- Verwahrungsort-Lookup wie Pool (lager, innendienst, peter_1/2/30).
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

ALTER TABLE public.personal_einsatzmittel
  ALTER COLUMN officer_id DROP NOT NULL;

ALTER TABLE public.personal_einsatzmittel
  ADD COLUMN IF NOT EXISTS verwahrungsort text;

ALTER TABLE public.personal_einsatzmittel
  DROP CONSTRAINT IF EXISTS personal_em_verwahrungsort_lookup;
ALTER TABLE public.personal_einsatzmittel
  ADD CONSTRAINT personal_em_verwahrungsort_lookup
  CHECK (
    verwahrungsort IS NULL
    OR verwahrungsort IN ('lager', 'innendienst', 'peter_1', 'peter_2', 'peter_30')
  );

ALTER TABLE public.personal_einsatzmittel
  DROP CONSTRAINT IF EXISTS personal_em_officer_or_ort;
ALTER TABLE public.personal_einsatzmittel
  ADD CONSTRAINT personal_em_officer_or_ort
  CHECK (officer_id IS NOT NULL OR verwahrungsort IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_personal_em_verwahrungsort
  ON public.personal_einsatzmittel (verwahrungsort);

CREATE INDEX IF NOT EXISTS idx_personal_em_category_ort
  ON public.personal_einsatzmittel (category, verwahrungsort);
