-- A parent deletion must never silently erase individually maintained training records.
CREATE OR REPLACE FUNCTION public.guard_training_session_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(OLD.munition_anzahl,0)>0
    OR EXISTS(SELECT 1 FROM einsatz_training_registrations WHERE session_id=OLD.id)
    OR EXISTS(SELECT 1 FROM einsatz_training_attendance WHERE session_id=OLD.id)
    OR EXISTS(SELECT 1 FROM einsatz_training_participations WHERE session_id=OLD.id)
    OR EXISTS(SELECT 1 FROM einsatz_training_completions WHERE session_id=OLD.id) THEN
    RAISE EXCEPTION 'Trainingstag hat verknüpfte Einträge oder Munitionsverbrauch. Bitte die betreffenden Einträge zuerst einzeln prüfen und entfernen.';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER guard_training_session_delete BEFORE DELETE ON public.einsatz_training_sessions
FOR EACH ROW EXECUTE FUNCTION public.guard_training_session_delete();

CREATE OR REPLACE FUNCTION public.remove_training_attendance(p_attendance_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE target public.einsatz_training_attendance%ROWTYPE;
BEGIN
  IF NOT can_manage_einsatzmittel() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO target FROM einsatz_training_attendance WHERE id=p_attendance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Anwesenheit nicht gefunden'; END IF;
  DELETE FROM einsatz_training_participations WHERE session_id=target.session_id AND officer_id=target.officer_id;
  DELETE FROM einsatz_training_attendance WHERE id=target.id;
END $$;

CREATE OR REPLACE FUNCTION public.save_training_munition(
  p_session_id uuid, p_previous_pool_id uuid, p_previous_quantity integer,
  p_pool_id uuid, p_quantity integer, p_marke text, p_kaliber text, p_art text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE target public.einsatz_training_sessions%ROWTYPE; stock public.pool_einsatzmittel%ROWTYPE; delta integer;
BEGIN
  IF NOT can_manage_einsatzmittel() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO target FROM einsatz_training_sessions WHERE id=p_session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trainingstag nicht gefunden'; END IF;
  IF target.munition_pool_id IS DISTINCT FROM p_previous_pool_id OR target.munition_anzahl IS DISTINCT FROM p_previous_quantity THEN
    RAISE EXCEPTION 'Verbrauch wurde zwischenzeitlich geändert. Bitte neu laden.';
  END IF;
  IF p_quantity IS NULL OR p_quantity<0 OR (p_quantity>0 AND p_pool_id IS NULL)
    OR (p_quantity=0 AND p_pool_id IS NOT NULL) THEN RAISE EXCEPTION 'Ungültiger Verbrauch'; END IF;
  FOR stock IN SELECT * FROM pool_einsatzmittel WHERE id IN (target.munition_pool_id,p_pool_id) ORDER BY id FOR UPDATE
  LOOP
    IF stock.id=p_pool_id AND (stock.category<>'munition' OR stock.removed_at IS NOT NULL OR stock.anzahl IS NULL) THEN
      RAISE EXCEPTION 'Pool-Munition nicht verfügbar';
    END IF;
    delta := CASE WHEN stock.id=target.munition_pool_id THEN coalesce(target.munition_anzahl,0) ELSE 0 END
           - CASE WHEN stock.id=p_pool_id THEN p_quantity ELSE 0 END;
    IF stock.anzahl IS NULL OR stock.anzahl+delta<0 THEN RAISE EXCEPTION 'Nicht genügend Munition im Pool'; END IF;
    UPDATE pool_einsatzmittel SET anzahl=anzahl+delta WHERE id=stock.id;
  END LOOP;
  IF p_pool_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pool_einsatzmittel WHERE id=p_pool_id) THEN
    RAISE EXCEPTION 'Pool-Munition nicht gefunden';
  END IF;
  UPDATE einsatz_training_sessions SET munition_pool_id=p_pool_id, munition_anzahl=p_quantity,
    munition_marke=p_marke,munition_kaliber=p_kaliber,munition_art=p_art,
    munition_recorded_at=now(),munition_recorded_by=auth.uid() WHERE id=p_session_id;
END $$;
REVOKE ALL ON FUNCTION public.remove_training_attendance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_training_attendance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.save_training_munition(uuid,uuid,integer,uuid,integer,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_training_munition(uuid,uuid,integer,uuid,integer,text,text,text) TO authenticated;
