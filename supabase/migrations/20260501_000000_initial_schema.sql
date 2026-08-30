-- Reconstructed baseline schema (not present in the original repo).
-- Inferred from TypeScript types, incremental migrations, and application usage.
-- All statements are idempotent so this file is safe on an existing production
-- database that already has these objects (CREATE IF NOT EXISTS / OR REPLACE).
-- Staff RLS policies that later migrations DROP+CREATE are intentionally omitted
-- here so a late apply on production does not resurrect superseded policy names.

-- Tables first: SQL-language functions are parsed at CREATE time and fail
-- if they reference relations that do not exist yet (Supabase Preview).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  dienstnummer text,
  gender text NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female')),
  organisation text NOT NULL DEFAULT 'Stadtpolizei',
  roles text[] NOT NULL DEFAULT ARRAY['user']::text[],
  active boolean NOT NULL DEFAULT true,
  size_preferences jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  sub_category text,
  gender text NOT NULL DEFAULT 'unisex' CHECK (gender IN ('male', 'female', 'unisex')),
  sizes text[] NOT NULL DEFAULT ARRAY[]::text[],
  price numeric NOT NULL DEFAULT 0,
  needs_tailoring boolean NOT NULL DEFAULT false,
  size_guide text,
  organisation text,
  active boolean NOT NULL DEFAULT true,
  min_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_article_number_organisation_key
  ON public.products (article_number, organisation);

CREATE TABLE IF NOT EXISTS public.inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  size text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (product_id, size)
);

CREATE TABLE IF NOT EXISTS public.quarters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  year integer NOT NULL,
  quarter_num integer NOT NULL CHECK (quarter_num BETWEEN 1 AND 4),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'closed')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tailor_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id uuid NOT NULL REFERENCES public.quarters (id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  note text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id),
  vorrechnung_url text,
  vorrechnung_name text,
  vorrechnung_number text,
  vorrechnung_amount numeric,
  vorrechnung_analysis jsonb,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered', 'partially_received', 'received'))
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id),
  product_id uuid NOT NULL REFERENCES public.products (id),
  quarter_id uuid NOT NULL REFERENCES public.quarters (id),
  size text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'pending_approval', 'approved', 'ordered_supplier',
    'at_tailor', 'ready_for_issue', 'partially_issued', 'issued', 'cancelled'
  )),
  quantity_received integer,
  quantity_issued integer,
  proc_listed boolean DEFAULT false,
  cancel_reason text,
  shifted_from uuid REFERENCES public.orders (id),
  tailor_job_id uuid REFERENCES public.tailor_jobs (id),
  delivery_id uuid REFERENCES public.deliveries (id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shoe_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id),
  amount numeric NOT NULL,
  approved_amount numeric NOT NULL DEFAULT 0,
  refund_date date NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES public.profiles (id),
  reviewed_at timestamptz,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  details text,
  user_id uuid REFERENCES public.profiles (id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id),
  year integer NOT NULL,
  total_budget numeric NOT NULL,
  valid_from date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, year, valid_from)
);

CREATE TABLE IF NOT EXISTS public.shoe_refund_caps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cap_amount numeric NOT NULL,
  valid_from date NOT NULL,
  note text,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id),
  size text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'approved', 'rejected', 'received')),
  note text,
  requested_by uuid NOT NULL REFERENCES public.profiles (id),
  approved_by uuid REFERENCES public.profiles (id),
  approved_at timestamptz,
  received_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grundausstattung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products (id),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_by uuid REFERENCES public.profiles (id),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organisation, product_id)
);

-- ---------------------------------------------------------------------------
-- Helper functions (after tables — LANGUAGE sql is bound at CREATE time)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_role(role_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role_name = ANY (roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, name, gender, organisation, roles, active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'gender', 'male'),
    COALESCE(NEW.raw_user_meta_data->>'organisation', 'Stadtpolizei'),
    ARRAY['user']::text[],
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS user_budgets_updated_at ON public.user_budgets;
CREATE TRIGGER user_budgets_updated_at
  BEFORE UPDATE ON public.user_budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS stock_orders_updated_at ON public.stock_orders;
CREATE TRIGGER stock_orders_updated_at
  BEFORE UPDATE ON public.stock_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- Views (later hardening sets security_invoker = on)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.orders_full AS
SELECT
  o.*,
  p.name AS product_name,
  p.article_number,
  p.category,
  p.needs_tailoring,
  pr.name AS user_name,
  pr.dienstnummer,
  pr.username,
  q.name AS quarter_name
FROM public.orders o
JOIN public.products p ON p.id = o.product_id
JOIN public.profiles pr ON pr.id = o.user_id
JOIN public.quarters q ON q.id = o.quarter_id;

CREATE OR REPLACE VIEW public.budget_usage AS
SELECT
  user_id,
  EXTRACT(YEAR FROM created_at)::int AS year,
  COALESCE(SUM(unit_price * quantity), 0) AS used
FROM public.orders
WHERE status NOT IN ('pending', 'cancelled')
GROUP BY user_id, EXTRACT(YEAR FROM created_at);

-- ---------------------------------------------------------------------------
-- RLS (enabled here; staff policies arrive in later migrations)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quarters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailor_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shoe_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shoe_refund_caps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grundausstattung ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- User-facing policies that later incremental migrations never defined.
-- DROP IF EXISTS so this file is re-runnable.

DROP POLICY IF EXISTS "Benutzer sieht eigenes Profil" ON public.profiles;
CREATE POLICY "Benutzer sieht eigenes Profil" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Angemeldete sehen Produkte" ON public.products;
CREATE POLICY "Angemeldete sehen Produkte" ON public.products
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Angemeldete sehen Quartale" ON public.quarters;
CREATE POLICY "Angemeldete sehen Quartale" ON public.quarters
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Benutzer sieht eigene Bestellungen" ON public.orders;
CREATE POLICY "Benutzer sieht eigene Bestellungen" ON public.orders
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Benutzer erstellt Warenkorb" ON public.orders;
CREATE POLICY "Benutzer erstellt Warenkorb" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Benutzer ändert eigenen Warenkorb" ON public.orders;
CREATE POLICY "Benutzer ändert eigenen Warenkorb" ON public.orders
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Benutzer löscht eigenen Warenkorb" ON public.orders;
CREATE POLICY "Benutzer löscht eigenen Warenkorb" ON public.orders
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "Angemeldete schreiben Protokoll" ON public.audit_log;
CREATE POLICY "Angemeldete schreiben Protokoll" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Benutzer liest eigenes Budget" ON public.user_budgets;
CREATE POLICY "Benutzer liest eigenes Budget" ON public.user_budgets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Genehmiger verwaltet Budgets" ON public.user_budgets;
CREATE POLICY "Genehmiger verwaltet Budgets" ON public.user_budgets
  FOR ALL TO authenticated
  USING (has_role('admin') OR has_role('genehmiger') OR has_role('approver'))
  WITH CHECK (has_role('admin') OR has_role('genehmiger') OR has_role('approver'));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
