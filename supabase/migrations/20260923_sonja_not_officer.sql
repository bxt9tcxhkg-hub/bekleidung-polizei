-- Sonja Dolliner (DN 24) ist kein Polizist.
-- Organisation bleibt Stadtpolizei (Bekleidung-Shop lädt Produkte über
-- organisation = profile.organisation). Keine profiles.officer-Spalte:
-- App-Filter über Seed-Feld officer: false + isPolizistForRoster (DN/Name).
-- Diese Migration spiegelt denselben Ausschluss für ET-Selbstanmeldung.
-- Idempotent. Live-DB wird vom Agent nicht angewandt.
--
-- Falls später eine Spalte ergänzt wird:
--   ALTER TABLE public.profiles
--     ADD COLUMN IF NOT EXISTS officer boolean NOT NULL DEFAULT true;
--   UPDATE public.profiles
--   SET officer = false
--   WHERE ltrim(trim(COALESCE(dienstnummer, '')), '0') = '24'
--     AND name ILIKE '%dolliner%'
--     AND name ILIKE '%sonja%';

CREATE OR REPLACE FUNCTION public.is_polizist_for_roster(
  p_organisation text,
  p_dienstnummer text,
  p_name text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_org text;
  v_dn text;
  v_name text;
BEGIN
  v_org := nullif(btrim(coalesce(p_organisation, '')), '');
  IF coalesce(v_org, 'Stadtpolizei') IS DISTINCT FROM 'Stadtpolizei' THEN
    RETURN false;
  END IF;

  v_dn := nullif(ltrim(btrim(coalesce(p_dienstnummer, '')), '0'), '');
  v_name := lower(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')));

  -- Seed officer: false — Sonja Dolliner / DN 24
  IF v_dn = '24' THEN
    RETURN false;
  END IF;
  IF v_name LIKE '%sonja%' AND v_name LIKE '%dolliner%' THEN
    RETURN false;
  END IF;

  RETURN true;
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
  v_dn text;
  v_name text;
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

  SELECT p.organisation, p.dienstnummer, p.name
    INTO v_org, v_dn, v_name
  FROM public.profiles p
  WHERE p.id = auth.uid();

  v_applies := lower(btrim(coalesce(v_applies, 'polizei')));
  IF v_applies = 'polizei' THEN
    IF NOT public.is_polizist_for_roster(v_org, v_dn, v_name) THEN
      RETURN false;
    END IF;
  ELSIF v_applies = 'parkaufsicht' THEN
    IF NOT public.officer_matches_et_applies_to(v_org, v_applies) THEN
      RETURN false;
    END IF;
  ELSIF v_applies = 'alle' THEN
    IF NOT (
      public.is_polizist_for_roster(v_org, v_dn, v_name)
      OR public.officer_matches_et_applies_to(v_org, 'parkaufsicht')
    ) THEN
      RETURN false;
    END IF;
  ELSE
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

REVOKE ALL ON FUNCTION public.is_polizist_for_roster(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_polizist_for_roster(text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.can_self_register_einsatztraining(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_self_register_einsatztraining(uuid) TO authenticated;
