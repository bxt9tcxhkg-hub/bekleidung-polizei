
-- Alte Policies entfernen
DROP POLICY IF EXISTS "auth_all_categories"          ON categories;
DROP POLICY IF EXISTS "auth_all_articles"            ON articles;
DROP POLICY IF EXISTS "auth_all_transactions"        ON transactions;
DROP POLICY IF EXISTS "auth_all_powder_measurements" ON powder_measurements;
DROP POLICY IF EXISTS "auth_all_powder_settings"     ON powder_settings;
DROP POLICY IF EXISTS "auth_all_bean_logs"           ON bean_logs;
DROP POLICY IF EXISTS "auth_all_bean_settings"       ON bean_settings;

-- Neue Policies: anon + authenticated dürfen alles (interne App, kein öffentlicher Zugriff)
CREATE POLICY "anon_all_categories"          ON categories          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_articles"            ON articles            FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_transactions"        ON transactions        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_powder_measurements" ON powder_measurements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_powder_settings"     ON powder_settings     FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_bean_logs"           ON bean_logs           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_bean_settings"       ON bean_settings       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
