-- Reaktion auf ein P1-Finding zu Runde 16 (Codex-Review auf Commit 660ddd1):
-- ueberstunden_monatsanteile() hatte keine ORDER BY-Klausel und damit auch
-- keine für die client-seitige Pagination nötige deterministische
-- Reihenfolge, und Ueberstunden.tsx rief das RPC bisher mit einer EINZIGEN
-- (nicht paginierten) Anfrage auf, während die begleitende Meldungen-Abfrage
-- bereits vollständig über fetchAllPages paginiert wird. Ein Monat mit mehr
-- genehmigten Meldungen als PostgREST' Standard-Zeilenobergrenze hätte also
-- nur die ersten Zeilen des RPC zurückbekommen; monatsUebersicht() ignoriert
-- Meldungen ohne Eintrag in der anteile-Map, die Sammelansicht/PDF hätte die
-- restlichen genehmigten Stunden also STILLSCHWEIGEND unterschlagen. Fix:
-- ORDER BY m.id (deterministisch, wie bei den übrigen paginierten Abfragen
-- dieser Seite) - die client-seitige Paginierung (fetchAllPages) folgt in
-- Ueberstunden.tsx.
CREATE OR REPLACE FUNCTION public.ueberstunden_monatsanteile(p_monat_start date, p_monat_ende date)
RETURNS TABLE(meldung_id uuid, beamter_id uuid, verguetung text, std_werktag_50 numeric, std_sonn_100 numeric, std_19_22 numeric, std_22_06 numeric, std_sonn_200 numeric)
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.beamter_id,
    m.verguetung,
    round(COALESCE(SUM(t.std_werktag_50) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_sonn_100) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_19_22) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_22_06) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4,
    round(COALESCE(SUM(t.std_sonn_200) FILTER (WHERE t.tag >= p_monat_start AND t.tag < p_monat_ende), 0) * 4) / 4
  FROM public.ueberstunden_meldungen m
  CROSS JOIN LATERAL public.ueberstunden_meldung_tage(
    m.beamter_id, (m.von_datum + m.von_zeit)::timestamp, (m.bis_datum + m.bis_zeit)::timestamp, m.id, m.created_at
  ) t
  WHERE m.status = 'genehmigt'
    AND m.von_datum < p_monat_ende
    AND m.bis_datum >= p_monat_start
  GROUP BY m.id, m.beamter_id, m.verguetung
  ORDER BY m.id;
END;
$$;
