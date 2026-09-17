-- Zwei versehentlich doppelt angelegte Personen zusammenführen (Admin-
-- Werkzeug): alle Verweise auf die zu entfernende Person werden auf die
-- verbleibende Person umgehängt, fehlende Stammdaten der verbleibenden
-- Person aus der entfernten ergänzt, danach wird die entfernte Person
-- gelöscht. Läuft atomar in einer Transaktion (Funktionsaufruf).
CREATE OR REPLACE FUNCTION public.merge_operational_persons(p_keep_id uuid, p_remove_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.has_role('admin') THEN
    RAISE EXCEPTION 'Nur die Administration kann Personen zusammenführen.';
  END IF;
  IF p_keep_id IS NULL OR p_remove_id IS NULL OR p_keep_id = p_remove_id THEN
    RAISE EXCEPTION 'Es müssen zwei unterschiedliche Personen angegeben werden.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.operational_persons WHERE id = p_keep_id) OR NOT EXISTS (SELECT 1 FROM public.operational_persons WHERE id = p_remove_id) THEN
    RAISE EXCEPTION 'Eine der beiden Personen wurde nicht gefunden.';
  END IF;

  -- Fehlende Stammdaten der verbleibenden Person aus der entfernten ergänzen.
  UPDATE public.operational_persons AS keep SET
    birth_date = COALESCE(keep.birth_date, remove.birth_date),
    phone = COALESCE(keep.phone, remove.phone),
    home_object_id = COALESCE(keep.home_object_id, remove.home_object_id),
    note = CASE WHEN remove.note IS NULL OR remove.note = '' THEN keep.note
                WHEN keep.note IS NULL OR keep.note = '' THEN remove.note
                ELSE keep.note || E'\n---\n' || remove.note END
  FROM public.operational_persons AS remove
  WHERE keep.id = p_keep_id AND remove.id = p_remove_id;

  -- einsatz_parteien hat UNIQUE(incident_id, person_id) - Zeilen, die für
  -- denselben Einsatz bei beiden Personen existieren, dürfen beim Umhängen
  -- nicht kollidieren; die der zu entfernenden Person verwerfen wir dort.
  DELETE FROM public.einsatz_parteien AS ep_remove
  WHERE ep_remove.person_id = p_remove_id
    AND EXISTS (SELECT 1 FROM public.einsatz_parteien AS ep_keep WHERE ep_keep.incident_id = ep_remove.incident_id AND ep_keep.person_id = p_keep_id);
  UPDATE public.einsatz_parteien SET person_id = p_keep_id WHERE person_id = p_remove_id;

  UPDATE public.mail_deliveries SET person_id = p_keep_id WHERE person_id = p_remove_id;
  UPDATE public.operational_person_notes SET person_id = p_keep_id WHERE person_id = p_remove_id;
  UPDATE public.operational_phone_numbers SET person_id = p_keep_id WHERE person_id = p_remove_id;
  UPDATE public.zentrale_av_bv SET person_id = p_keep_id WHERE person_id = p_remove_id;
  UPDATE public.zentrale_fahndungen SET person_id = p_keep_id WHERE person_id = p_remove_id;
  UPDATE public.incident_reports SET caller_person_id = p_keep_id WHERE caller_person_id = p_remove_id;
  UPDATE public.incident_reports SET involved_person_id = p_keep_id WHERE involved_person_id = p_remove_id;
  UPDATE public.innendienst_records SET person_id = p_keep_id WHERE person_id = p_remove_id;
  UPDATE public.schutzfaelle SET gefaehrder_id = p_keep_id WHERE gefaehrder_id = p_remove_id;
  UPDATE public.schutzfall_personen SET person_id = p_keep_id WHERE person_id = p_remove_id;

  DELETE FROM public.operational_persons WHERE id = p_remove_id;
END;
$$;
REVOKE ALL ON FUNCTION public.merge_operational_persons(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.merge_operational_persons(uuid,uuid) TO authenticated;
