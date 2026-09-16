-- In-house Laufzeitfehler (kein Drittanbieter). Idempotent.
-- Operator wendet diese Datei an; der Client sendet nichts an Sentry o. Ä.

CREATE TABLE IF NOT EXISTS public.app_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES public.profiles (id),
  role_snapshot text[] NOT NULL DEFAULT '{}',
  path text NOT NULL,
  message text NOT NULL,
  stack text,
  source text NOT NULL CHECK (source IN ('boundary', 'window', 'unhandledrejection')),
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_app_errors_created_at ON public.app_errors (created_at DESC);

ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_errors FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.app_errors FROM authenticated;
GRANT INSERT, SELECT ON TABLE public.app_errors TO authenticated;

DROP POLICY IF EXISTS "Angemeldete schreiben eigene Fehler" ON public.app_errors;
CREATE POLICY "Angemeldete schreiben eigene Fehler" ON public.app_errors
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Admin sieht Fehler" ON public.app_errors;
CREATE POLICY "Admin sieht Fehler" ON public.app_errors
  FOR SELECT TO authenticated
  USING (has_role('admin'));
