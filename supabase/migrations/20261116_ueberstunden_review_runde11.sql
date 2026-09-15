-- Reaktion auf ein Review-Finding (P1): set_config(..., true) ist
-- transaktions-, nicht anweisungslokal - der Bypass-Schalter
-- "ueberstunden.recompute_cascade" blieb nach der internen Reallokations-
-- UPDATE für den REST der Transaktion auf 'on' stehen. Bearbeitet ein
-- einzelner Request mehrere Zeilen (z. B. ein PATCH mit .in('id', [...])),
-- und löst eine frühere Zeile darin eine Reallokation aus, sahen alle
-- NACHFOLGENDEN Zeilen DESSELBEN Requests in enforce_ueberstunden_update()
-- den Schalter fälschlich als 'on' und übersprangen jede Status-/
-- Feldschutzprüfung - ein Beamter hätte so z. B. eine bereits genehmigte
-- eigene Meldung im selben PATCH wie eine zulässige Änderung (die eine
-- Reallokation auslöst) manipulieren können. Fix: den vorherigen Wert vor
-- dem Setzen merken und nach der internen UPDATE wiederherstellen, statt
-- ihn bis Transaktionsende stehen zu lassen.

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
  -- Nur den Bypass für die eigene interne UPDATE aktiv lassen - direkt
  -- danach wieder auf den Zustand vor diesem Aufruf zurücksetzen, damit
  -- nachfolgende Zeilen DESSELBEN äußeren Requests wieder normal geprüft
  -- werden. COALESCE auf '' statt NULL, weil set_config keinen NULL-Wert
  -- akzeptiert - eine leere Zeichenkette ist ungleich 'on' und verhält sich
  -- für die obige Prüfung identisch zu "nie gesetzt".
  PERFORM set_config('ueberstunden.recompute_cascade', COALESCE(prev_cascade, ''), true);
END;
$$;
