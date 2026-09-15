
CREATE TABLE IF NOT EXISTS vending_kontrollen (
  id         SERIAL PRIMARY KEY,
  machine_id TEXT        NOT NULL,
  date       DATE        NOT NULL,
  verbrauch  JSONB       NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vending_kontrollen_date_idx ON vending_kontrollen(date);
