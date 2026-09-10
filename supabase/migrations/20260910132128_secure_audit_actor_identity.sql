ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'client';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_log_source_check' AND conrelid='public.audit_log'::regclass) THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_source_check CHECK (source IN ('client','database'));
  END IF;
END $$;
DROP POLICY IF EXISTS "Alle können Einträge schreiben" ON public.audit_log;
DROP POLICY IF EXISTS "Angemeldete schreiben Protokoll" ON public.audit_log;
DROP POLICY IF EXISTS "Eigene ergänzende Protokolle" ON public.audit_log;
CREATE POLICY "Eigene ergänzende Protokolle" ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND source = 'client'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND active));
