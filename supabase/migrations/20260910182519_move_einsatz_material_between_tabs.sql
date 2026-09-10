CREATE OR REPLACE FUNCTION public.move_einsatz_material(p_material_id uuid,p_target_tab_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public
AS $$
DECLARE source_tab_id uuid; source_area text; target_area text;
BEGIN
  IF NOT public.can_manage_einsatzmittel() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT tab_id INTO source_tab_id FROM public.einsatz_materials
    WHERE id=p_material_id AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unterlage nicht gefunden'; END IF;
  SELECT area INTO source_area FROM public.einsatz_material_tabs WHERE id=source_tab_id;
  SELECT area INTO target_area FROM public.einsatz_material_tabs
    WHERE id=p_target_tab_id AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ziel-Tab nicht gefunden'; END IF;
  IF source_area IS DISTINCT FROM target_area THEN
    RAISE EXCEPTION 'Unterlagen können nur innerhalb desselben Bereichs verschoben werden';
  END IF;
  UPDATE public.einsatz_materials SET tab_id=p_target_tab_id,updated_at=now() WHERE id=p_material_id;
END $$;
REVOKE ALL ON FUNCTION public.move_einsatz_material(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.move_einsatz_material(uuid,uuid) TO authenticated;
