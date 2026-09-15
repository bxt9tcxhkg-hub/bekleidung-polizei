
-- Add valid_from to user_budgets, change unique key to allow scheduled changes
ALTER TABLE user_budgets
  ADD COLUMN IF NOT EXISTS valid_from date NOT NULL DEFAULT CURRENT_DATE;

ALTER TABLE user_budgets
  DROP CONSTRAINT IF EXISTS user_budgets_user_id_year_key;

ALTER TABLE user_budgets
  ADD CONSTRAINT user_budgets_user_id_year_valid_from_key
  UNIQUE (user_id, year, valid_from);

-- Shoe refund cap history table
CREATE TABLE IF NOT EXISTS shoe_refund_caps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cap_amount numeric(10,2) NOT NULL,
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Default value
INSERT INTO shoe_refund_caps (cap_amount, valid_from)
VALUES (120.00, '2026-01-01')
ON CONFLICT DO NOTHING;
