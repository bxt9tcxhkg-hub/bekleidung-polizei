
CREATE TABLE IF NOT EXISTS machines (
  id         text        PRIMARY KEY,
  type       text        NOT NULL DEFAULT 'vending',
  name       text        NOT NULL,
  config     jsonb       NOT NULL DEFAULT '{}',
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON machines FOR ALL USING (true) WITH CHECK (true);

-- Trigger für updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER machines_updated_at
  BEFORE UPDATE ON machines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
