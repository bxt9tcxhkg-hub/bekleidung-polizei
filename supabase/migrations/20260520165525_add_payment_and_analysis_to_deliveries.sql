
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS paid boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS vorrechnung_analysis jsonb;
