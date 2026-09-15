
-- Budget pro Benutzer/Jahr
CREATE TABLE public.user_budgets (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year integer NOT NULL,
  total_budget numeric NOT NULL DEFAULT 350,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, year)
);

ALTER TABLE public.user_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own budget" ON public.user_budgets
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "staff can read all budgets" ON public.user_budgets
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND roles && ARRAY['admin','sachbearbeiter','genehmiger'])
  );

CREATE POLICY "staff can manage budgets" ON public.user_budgets
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND roles && ARRAY['admin','sachbearbeiter','genehmiger'])
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND roles && ARRAY['admin','sachbearbeiter','genehmiger'])
  );

-- Preis zum Bestellzeitpunkt speichern
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;
