-- Munitionsverbrauch am Einsatztraining (Session-Ebene) und
-- Ausbuchung persönlicher/Pool-Einsatzmittel (removed_at statt Hard-Delete).
-- Kein Munitions-Katalog, keine Dienstregeln, kein Genehmiger.
-- Pool-Bestand wird nur verringert, wenn die UI eine konkrete
-- Pool-Munitionszeile wählt (Client-Helfer, kein Trigger).
-- Rechte unverändert: Lesen jede einsatz_mt-Rolle; Schreiben SB/Admin.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

-- A) Verbrauchsfelder auf dem Trainingstag (intern und extern).
ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS munition_anzahl integer;

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS munition_marke text;

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS munition_kaliber text;

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS munition_art text;

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS munition_pool_id uuid REFERENCES public.pool_einsatzmittel (id) ON DELETE SET NULL;

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS munition_recorded_at timestamptz;

ALTER TABLE public.einsatz_training_sessions
  ADD COLUMN IF NOT EXISTS munition_recorded_by uuid REFERENCES public.profiles (id);

ALTER TABLE public.einsatz_training_sessions
  DROP CONSTRAINT IF EXISTS et_session_munition_anzahl_nonneg;
ALTER TABLE public.einsatz_training_sessions
  ADD CONSTRAINT et_session_munition_anzahl_nonneg
  CHECK (munition_anzahl IS NULL OR munition_anzahl >= 0);

CREATE INDEX IF NOT EXISTS idx_et_sessions_munition_pool
  ON public.einsatz_training_sessions (munition_pool_id)
  WHERE munition_pool_id IS NOT NULL;

-- B) Ausbuchung: alle persönlichen und Pool-Kategorien.
ALTER TABLE public.personal_einsatzmittel
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

ALTER TABLE public.personal_einsatzmittel
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES public.profiles (id);

ALTER TABLE public.personal_einsatzmittel
  ADD COLUMN IF NOT EXISTS removal_reason text;

ALTER TABLE public.pool_einsatzmittel
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

ALTER TABLE public.pool_einsatzmittel
  ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES public.profiles (id);

ALTER TABLE public.pool_einsatzmittel
  ADD COLUMN IF NOT EXISTS removal_reason text;

CREATE INDEX IF NOT EXISTS idx_personal_em_active
  ON public.personal_einsatzmittel (category)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_personal_em_removed
  ON public.personal_einsatzmittel (removed_at)
  WHERE removed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pool_em_active
  ON public.pool_einsatzmittel (category, verwahrungsort)
  WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pool_em_removed
  ON public.pool_einsatzmittel (removed_at)
  WHERE removed_at IS NOT NULL;
