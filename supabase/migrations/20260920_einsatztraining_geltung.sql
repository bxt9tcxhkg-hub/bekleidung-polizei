-- Einsatztraining Owner-Fachlogik 2026-09-06 (Muhammet):
-- Geltung / Zielgruppe je Modul: Polizei | Parkaufsicht | Alle.
-- Intern/extern/zusatz bleibt aus module_type + kind abgeleitet
-- (pflicht_halbjahr = intern, kind extern = extern, sonst zusatz).
-- Taktung nur Anzeige: intern 2 Module/Jahr, extern 4 Module/Jahr.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.

ALTER TABLE public.einsatz_training_modules
  ADD COLUMN IF NOT EXISTS applies_to text;

UPDATE public.einsatz_training_modules
SET applies_to = 'polizei'
WHERE applies_to IS NULL;

UPDATE public.einsatz_training_modules
SET applies_to = 'parkaufsicht'
WHERE applies_to = 'polizei'
  AND lower(name) LIKE '%parkaufsicht%';

ALTER TABLE public.einsatz_training_modules
  ALTER COLUMN applies_to SET DEFAULT 'polizei';

ALTER TABLE public.einsatz_training_modules
  ALTER COLUMN applies_to SET NOT NULL;

ALTER TABLE public.einsatz_training_modules
  DROP CONSTRAINT IF EXISTS einsatz_training_modules_applies_to_check;

ALTER TABLE public.einsatz_training_modules
  ADD CONSTRAINT einsatz_training_modules_applies_to_check
  CHECK (applies_to IN ('polizei', 'parkaufsicht', 'alle'));

CREATE INDEX IF NOT EXISTS idx_et_modules_applies_to_active
  ON public.einsatz_training_modules (applies_to, active);

CREATE OR REPLACE FUNCTION public.officer_matches_et_applies_to(
  p_organisation text,
  p_applies_to text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_org text;
  v_applies text;
BEGIN
  v_org := nullif(btrim(coalesce(p_organisation, '')), '');
  v_applies := lower(btrim(coalesce(p_applies_to, 'polizei')));
  IF v_applies = 'polizei' THEN
    RETURN coalesce(v_org, 'Stadtpolizei') = 'Stadtpolizei';
  END IF;
  IF v_applies = 'parkaufsicht' THEN
    RETURN v_org = 'Parkaufsicht';
  END IF;
  IF v_applies = 'alle' THEN
    RETURN coalesce(v_org, 'Stadtpolizei') IN ('Stadtpolizei', 'Parkaufsicht');
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_self_register_einsatztraining(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_announced boolean;
  v_capacity integer;
  v_module uuid;
  v_count integer;
  v_applies text;
  v_org text;
BEGIN
  IF NOT public.has_portal_area_access('einsatz_mt') THEN
    RETURN false;
  END IF;

  SELECT s.announced, s.capacity, s.module_id
    INTO v_announced, v_capacity, v_module
  FROM public.einsatz_training_sessions s
  WHERE s.id = p_session_id;

  IF v_module IS NULL OR v_announced IS NOT TRUE THEN
    RETURN false;
  END IF;

  SELECT m.applies_to INTO v_applies
  FROM public.einsatz_training_modules m
  WHERE m.id = v_module;

  SELECT p.organisation INTO v_org
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF NOT public.officer_matches_et_applies_to(v_org, v_applies) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.einsatz_training_completions c
    WHERE c.officer_id = auth.uid()
      AND c.module_id = v_module
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.einsatz_training_registrations r
    WHERE r.session_id = p_session_id
      AND r.officer_id = auth.uid()
  ) THEN
    RETURN false;
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_count
    FROM public.einsatz_training_registrations r
    WHERE r.session_id = p_session_id;
    IF v_count >= v_capacity THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.officer_matches_et_applies_to(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.officer_matches_et_applies_to(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.can_self_register_einsatztraining(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_self_register_einsatztraining(uuid) TO authenticated;
