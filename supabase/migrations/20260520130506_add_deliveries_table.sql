
CREATE TABLE deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  vorrechnung_url TEXT,
  vorrechnung_name TEXT,
  vorrechnung_number TEXT,
  vorrechnung_amount NUMERIC(10,2),
  lieferschein_url TEXT,
  lieferschein_name TEXT,
  ai_match_result JSONB,
  status TEXT DEFAULT 'ordered' CHECK (status IN ('ordered', 'partially_received', 'received'))
);

ALTER TABLE orders ADD COLUMN delivery_id UUID REFERENCES deliveries(id);

CREATE INDEX idx_orders_delivery_id ON orders(delivery_id);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sachbearbeiter can manage deliveries"
  ON deliveries FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (roles @> ARRAY['admin'] OR roles @> ARRAY['sachbearbeiter'])
    )
  );
