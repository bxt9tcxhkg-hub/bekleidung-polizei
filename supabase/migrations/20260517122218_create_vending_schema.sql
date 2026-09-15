
-- Kategorien
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📦',
  color TEXT NOT NULL DEFAULT '#6b7280',
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Artikel
CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cat TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE SET DEFAULT,
  barcode TEXT UNIQUE,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  max_stock INTEGER NOT NULL DEFAULT 50,
  unit TEXT NOT NULL DEFAULT 'Stück',
  image_url TEXT,
  brand TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transaktionen
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  user_name TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  cats JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pulverautomat Messungen
CREATE TABLE IF NOT EXISTS powder_measurements (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  weight INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pulverautomat Einstellungen
CREATE TABLE IF NOT EXISTS powder_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  fill_capacity INTEGER NOT NULL DEFAULT 1000,
  gram_per_drink NUMERIC(6,2) NOT NULL DEFAULT 7,
  price_per_drink NUMERIC(6,2) NOT NULL DEFAULT 0.80,
  cost_per_100g NUMERIC(6,2) NOT NULL DEFAULT 2.20,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bohnenkaffee Tages-Logs
CREATE TABLE IF NOT EXISTS bean_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  bean_g INTEGER NOT NULL,
  milk_ml INTEGER NOT NULL,
  users INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bohnenkaffee Einstellungen
CREATE TABLE IF NOT EXISTS bean_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  daily_users INTEGER NOT NULL DEFAULT 20,
  cups_per_user NUMERIC(4,2) NOT NULL DEFAULT 1.8,
  gram_per_cup NUMERIC(5,2) NOT NULL DEFAULT 9,
  milk_ml_per_cup NUMERIC(5,2) NOT NULL DEFAULT 60,
  bean_cost_per_100g NUMERIC(6,2) NOT NULL DEFAULT 3.50,
  milk_cost_per_liter NUMERIC(6,2) NOT NULL DEFAULT 1.20,
  bean_bag_g INTEGER NOT NULL DEFAULT 500,
  current_bean_g INTEGER NOT NULL DEFAULT 0,
  current_milk_ml INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER powder_settings_updated_at BEFORE UPDATE ON powder_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER bean_settings_updated_at BEFORE UPDATE ON bean_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS aktivieren
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE powder_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE powder_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bean_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bean_settings       ENABLE ROW LEVEL SECURITY;

-- Für alle authenticated User: voller Zugriff (2–5 interne Nutzer)
CREATE POLICY "auth_all_categories"          ON categories          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_articles"            ON articles            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_transactions"        ON transactions        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_powder_measurements" ON powder_measurements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_powder_settings"     ON powder_settings     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_bean_logs"           ON bean_logs           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_bean_settings"       ON bean_settings       FOR ALL TO authenticated USING (true) WITH CHECK (true);
