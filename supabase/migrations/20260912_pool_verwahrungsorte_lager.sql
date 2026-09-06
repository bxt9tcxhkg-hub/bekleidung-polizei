-- Pool-Verwahrungsorte erweitern (Spind 1/2, Waffentresor Zentrale/Keller)
-- und optionale Lager-Notiz (Freitext) auf pool_einsatzmittel.
-- Persönliche EM teilen dasselbe CHECK-Lookup — Constraint mitziehen,
-- damit die DB konsistent bleibt. UI-Pflicht für die neuen Orte und die
-- Lager-Notiz gilt für Pool; persönliche Auswahl nutzt dasselbe Lookup.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

ALTER TABLE public.pool_einsatzmittel
  ADD COLUMN IF NOT EXISTS lager_notiz text;

ALTER TABLE public.pool_einsatzmittel
  DROP CONSTRAINT IF EXISTS pool_einsatzmittel_verwahrungsort_check;
ALTER TABLE public.pool_einsatzmittel
  DROP CONSTRAINT IF EXISTS pool_em_verwahrungsort_lookup;
ALTER TABLE public.pool_einsatzmittel
  ADD CONSTRAINT pool_em_verwahrungsort_lookup
  CHECK (verwahrungsort IN (
    'lager',
    'innendienst',
    'peter_1',
    'peter_2',
    'peter_30',
    'spind_1',
    'spind_2',
    'waffentresor_zentrale',
    'waffentresor_keller'
  ));

ALTER TABLE public.pool_einsatzmittel
  DROP CONSTRAINT IF EXISTS pool_em_lager_notiz_only_lager;
ALTER TABLE public.pool_einsatzmittel
  ADD CONSTRAINT pool_em_lager_notiz_only_lager
  CHECK (lager_notiz IS NULL OR verwahrungsort = 'lager');

ALTER TABLE public.personal_einsatzmittel
  DROP CONSTRAINT IF EXISTS personal_em_verwahrungsort_lookup;
ALTER TABLE public.personal_einsatzmittel
  ADD CONSTRAINT personal_em_verwahrungsort_lookup
  CHECK (
    verwahrungsort IS NULL
    OR verwahrungsort IN (
      'lager',
      'innendienst',
      'peter_1',
      'peter_2',
      'peter_30',
      'spind_1',
      'spind_2',
      'waffentresor_zentrale',
      'waffentresor_keller'
    )
  );
