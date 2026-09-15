
ALTER TABLE transactions 
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'verkauf',
  ADD COLUMN IF NOT EXISTS note text DEFAULT '';
