-- Bearbeiten eines Straßenzustandsberichts muss atomar sein: die bisherige
-- Umsetzung (Update, dann DELETE, dann INSERT als drei getrennte
-- PostgREST-Aufrufe) hätte bei einem fehlschlagenden INSERT (z. B. eine vom
-- Client nicht abgefangene Constraint-Verletzung) die bereits gelöschten
-- Original-Zeilen unwiederbringlich verloren. Alles in einer einzigen
-- Transaktion via RPC, plus: ein bereits archiviertes PDF wird beim
-- Bearbeiten ungültig (Zuordnung wird gelöscht), da es nicht mehr zum neuen
-- Inhalt passt - die Oberfläche verlangt dann ein erneutes Archivieren.
CREATE OR REPLACE FUNCTION public.strassenzustand_bericht_ersetzen(p_bericht_id uuid, p_anmerkung text, p_zeilen jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NOT can_manage_zentrale() THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  IF NOT EXISTS (SELECT 1 FROM strassenzustand_berichte WHERE id = p_bericht_id) THEN RAISE EXCEPTION 'Bericht nicht gefunden'; END IF;

  UPDATE strassenzustand_berichte
    SET anmerkung = p_anmerkung,
        pdf_file_key = NULL, pdf_file_name = NULL, pdf_uploaded_at = NULL, pdf_uploaded_by = NULL
    WHERE id = p_bericht_id;

  DELETE FROM strassenzustand_berichtzeilen WHERE bericht_id = p_bericht_id;

  INSERT INTO strassenzustand_berichtzeilen (
    bericht_id, strasse_id, strasse_freitext, zustand, zustand_freitext,
    auftraggeber_id, auftraggeber_freitext, melder_id, melder_freitext,
    gueltig_von, gueltig_bis, created_at
  )
  SELECT
    p_bericht_id,
    NULLIF(elem->>'strasse_id', '')::uuid,
    elem->>'strasse_freitext',
    elem->>'zustand',
    elem->>'zustand_freitext',
    NULLIF(elem->>'auftraggeber_id', '')::uuid,
    elem->>'auftraggeber_freitext',
    NULLIF(elem->>'melder_id', '')::uuid,
    elem->>'melder_freitext',
    (elem->>'gueltig_von')::timestamptz,
    (elem->>'gueltig_bis')::timestamptz,
    COALESCE((elem->>'created_at')::timestamptz, clock_timestamp())
  FROM jsonb_array_elements(p_zeilen) AS elem;
END $$;
REVOKE ALL ON FUNCTION public.strassenzustand_bericht_ersetzen(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.strassenzustand_bericht_ersetzen(uuid,text,jsonb) TO authenticated;
