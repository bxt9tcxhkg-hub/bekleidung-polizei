CREATE OR REPLACE FUNCTION public.ueberstunden_reallocate_nachfolgende(p_beamter_id uuid, p_tag date, p_von timestamp, p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  prev_cascade text := current_setting('ueberstunden.recompute_cascade', true);
BEGIN
  PERFORM set_config('ueberstunden.recompute_cascade', 'on', true);
  UPDATE public.ueberstunden_meldungen m
  SET updated_at = now()
  WHERE m.beamter_id = p_beamter_id
    AND public.ueberstunden_zaehlt_zum_topf(m.status)
    AND ((m.von_datum + m.von_zeit)::timestamp, m.id) > (p_von, p_id)
    AND EXISTS (
      SELECT 1 FROM public.ueberstunden_tagesstunden((m.von_datum + m.von_zeit)::timestamp, (m.bis_datum + m.bis_zeit)::timestamp) th
      WHERE th.tag = p_tag
    );
  PERFORM set_config('ueberstunden.recompute_cascade', COALESCE(prev_cascade, ''), true);
END;
$$;
