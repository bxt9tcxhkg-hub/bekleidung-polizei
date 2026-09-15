
CREATE TABLE IF NOT EXISTS machine_slots (
  device_id   text        NOT NULL,
  config      jsonb       NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id)
);
