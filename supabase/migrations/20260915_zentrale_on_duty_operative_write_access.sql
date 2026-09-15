-- Im Bereich Zentrale konnten bisher nur Genehmiger/Admin bzw. Sachbearbeiter
-- mit eingeschaltetem operativen Modus (can_manage_zentrale()) operative
-- Einträge erfassen - für Meldungen (incident_reports) und Baustellen gilt
-- schon lange zusätzlich can_manage_zentrale() OR is_zentralist_on_duty(),
-- diese Erweiterung fehlte aber beim späteren Ausbau des Personen-/Objekte-
-- Registers, der sechs Kategorietabellen, der Personenhinweise und des
-- Straßenzustands: ein diensthabender Zentralist ohne eigene erweiterte
-- Rolle konnte dort nichts anlegen oder bearbeiten, obwohl er im Tagesdienst
-- genau dafür eingeteilt ist. Löschen bleibt bei den meisten Tabellen bewusst
-- Verwaltung vorbehalten (wie bei incident_reports) - Ausnahme ist der
-- Straßenzustandsbericht, wo der Benutzer explizit auch löschen können muss.

-- ===== Personen-/Objekte-Register =====
DROP POLICY "Personen anlegen" ON public.operational_persons;
CREATE POLICY "Personen anlegen" ON public.operational_persons FOR INSERT TO authenticated
  WITH CHECK ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND created_by = (SELECT auth.uid()));
DROP POLICY "Personen ändern" ON public.operational_persons;
CREATE POLICY "Personen ändern" ON public.operational_persons FOR UPDATE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
  WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

DROP POLICY "Objekte anlegen" ON public.operational_objects;
CREATE POLICY "Objekte anlegen" ON public.operational_objects FOR INSERT TO authenticated
  WITH CHECK ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND created_by = (SELECT auth.uid()));
DROP POLICY "Objekte ändern" ON public.operational_objects;
CREATE POLICY "Objekte ändern" ON public.operational_objects FOR UPDATE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
  WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

-- ===== Personenhinweise (Löschen bleibt manager-only) =====
DROP POLICY "Operative Personenhinweise anlegen" ON public.operational_person_notes;
CREATE POLICY "Operative Personenhinweise anlegen" ON public.operational_person_notes FOR INSERT TO authenticated
  WITH CHECK ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND created_by = (SELECT auth.uid()));
DROP POLICY "Operative Personenhinweise ändern" ON public.operational_person_notes;
CREATE POLICY "Operative Personenhinweise ändern" ON public.operational_person_notes FOR UPDATE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
  WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

-- ===== Die sechs Kategorietabellen (Löschen bleibt manager-only) =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['zentrale_av_bv','zentrale_fahndungen','zentrale_schluessel','zentrale_kontakte','zentrale_alarmierung','zentrale_unterlagen'] LOOP
    EXECUTE format('DROP POLICY "%1$s anlegen" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s anlegen" ON public.%1$s FOR INSERT TO authenticated WITH CHECK ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND created_by = (SELECT auth.uid()))', t);
    EXECUTE format('DROP POLICY "%1$s ändern" ON public.%1$s', t);
    EXECUTE format('CREATE POLICY "%1$s ändern" ON public.%1$s FOR UPDATE TO authenticated USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty()) WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty())', t);
  END LOOP;
END $$;

-- ===== Straßenzustandsberichte: erfassen, bearbeiten UND löschen =====
DROP POLICY "Straßenzustandsberichte anlegen" ON public.strassenzustand_berichte;
CREATE POLICY "Straßenzustandsberichte anlegen" ON public.strassenzustand_berichte FOR INSERT TO authenticated
  WITH CHECK ((public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND bearbeiter = (SELECT auth.uid()));
DROP POLICY "Straßenzustandsberichte ändern" ON public.strassenzustand_berichte;
CREATE POLICY "Straßenzustandsberichte ändern" ON public.strassenzustand_berichte FOR UPDATE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
  WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
DROP POLICY "Straßenzustandsberichte löschen" ON public.strassenzustand_berichte;
CREATE POLICY "Straßenzustandsberichte löschen" ON public.strassenzustand_berichte FOR DELETE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

DROP POLICY "Straßenzustandszeilen anlegen" ON public.strassenzustand_berichtzeilen;
CREATE POLICY "Straßenzustandszeilen anlegen" ON public.strassenzustand_berichtzeilen FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
DROP POLICY "Straßenzustandszeilen ändern" ON public.strassenzustand_berichtzeilen;
CREATE POLICY "Straßenzustandszeilen ändern" ON public.strassenzustand_berichtzeilen FOR UPDATE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
  WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
DROP POLICY "Straßenzustandszeilen löschen" ON public.strassenzustand_berichtzeilen;
CREATE POLICY "Straßenzustandszeilen löschen" ON public.strassenzustand_berichtzeilen FOR DELETE TO authenticated
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

-- Die atomare Bearbeiten-RPC prüft die Berechtigung bisher selbst nur gegen
-- can_manage_zentrale() - dieselbe Erweiterung hier, sonst würde ein
-- diensthabender Zentralist zwar einen Bericht anlegen, aber nicht mehr über
-- die Oberfläche bearbeiten können.
CREATE OR REPLACE FUNCTION public.strassenzustand_bericht_ersetzen(p_bericht_id uuid, p_anmerkung text, p_zeilen jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF NOT (can_manage_zentrale() OR is_zentralist_on_duty()) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
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
