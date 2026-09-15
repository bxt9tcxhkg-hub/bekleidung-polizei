ALTER TABLE machine_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON machine_slots FOR ALL USING (true) WITH CHECK (true);
