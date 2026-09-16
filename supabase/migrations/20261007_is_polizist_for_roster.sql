-- Hilfsfunktion für Polizei-Offizierslisten.
-- Sonja Dolliner (DN 24) ist kein Polizist; Organisation bleibt Stadtpolizei.
-- Keine Änderung an can_self_register_einsatztraining (Iststand bleibt).
-- Idempotent. Live-DB wird erst angewandt, wenn der Betreiber db push ausführt.

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

  IF v_dn = '24' THEN
    RETURN false;
  END IF;
  IF v_name LIKE '%sonja%' AND v_name LIKE '%dolliner%' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_polizist_for_roster(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_polizist_for_roster(text, text, text) TO authenticated;
