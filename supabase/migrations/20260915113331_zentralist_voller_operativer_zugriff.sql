-- Jede/r diensthabende Zentralist(in) (und laut vorheriger Migration auch
-- Innendienst) muss Einsätze, Straßenzustandsberichte, AV/BV & EV,
-- Personenhinweise, Baustellen, Operative Lagen und Fahndungen anlegen,
-- BEARBEITEN UND LÖSCHEN können - bisher war das DELETE (und bei Baustellen/
-- Operativer Lage auch UPDATE bzw. das direkte Anlegen als "offen" statt
-- "gemeldet") an mehreren Stellen noch der Verwaltung (can_manage_zentrale())
-- vorbehalten. Straßenzustandsberichte/-zeilen waren bereits vollständig
-- erweitert (frühere Migration) und werden hier nicht angefasst.

-- Einsätze (incident_reports): DELETE war Verwaltung vorbehalten.
ALTER POLICY "Einsatzmeldungen nur durch Verwaltung löschen" ON public.incident_reports
  RENAME TO "Einsatzmeldungen löschen";
ALTER POLICY "Einsatzmeldungen löschen" ON public.incident_reports
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

-- Personenhinweise: DELETE war Verwaltung vorbehalten.
ALTER POLICY "Operative Personenhinweise löschen" ON public.operational_person_notes
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

-- Der Trigger, der ein "weiches Löschen" per active=false umgeht (Runde 15),
-- muss mit der jetzt erweiterten DELETE-Berechtigung übereinstimmen - sonst
-- dürfte ein diensthabender Zentralist den Hinweis zwar endgültig löschen,
-- aber nicht mehr (de)aktivieren, was inkonsistent wäre.
CREATE OR REPLACE FUNCTION public.enforce_operational_person_notes_active() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT (public.can_manage_zentrale() OR public.is_zentralist_on_duty()) AND NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'Nur die Verwaltung oder ein diensthabender Zentralist/Innendienst kann einen Personenhinweis (de)aktivieren.';
  END IF;
  RETURN NEW;
END;
$$;

-- AV/BV & EV: DELETE war Verwaltung vorbehalten.
ALTER POLICY "zentrale_av_bv löschen" ON public.zentrale_av_bv
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

-- Fahndungen: DELETE war Verwaltung vorbehalten.
ALTER POLICY "zentrale_fahndungen löschen" ON public.zentrale_fahndungen
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());

-- Baustellen: ÄNDERN (Bestätigen/Bearbeiten/Abschließen) und LÖSCHEN waren
-- komplett der Verwaltung vorbehalten; ANLEGEN erlaubte nur der Verwaltung,
-- direkt als "offen" statt als prüfpflichtig "gemeldet" zu starten.
ALTER POLICY "Baustellen ändern" ON public.zentrale_baustellen
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty())
  WITH CHECK (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
ALTER POLICY "Baustellen löschen" ON public.zentrale_baustellen
  USING (public.can_manage_zentrale() OR public.is_zentralist_on_duty());
ALTER POLICY "Baustellen melden" ON public.zentrale_baustellen
  WITH CHECK (
    public.has_portal_area_access('zentrale')
    AND (created_by = (select auth.uid()))
    AND ((status = 'gemeldet') OR public.can_manage_zentrale() OR public.is_zentralist_on_duty())
    AND (confirmed_by IS NULL) AND (confirmed_at IS NULL)
  );

-- Operative Lage (zentrale_entries, category='lage'): war Teil der
-- "category <> 'kontrollauftrag' -> can_manage_zentrale()"-Sammelregel: die
-- Kategorie 'lage' wird jetzt herausgelöst, 'brief' (RSa/RSb) und 'uebergabe'
-- (Schichtübergabe) bleiben unverändert der Verwaltung vorbehalten.
ALTER POLICY "Zentrale Einträge anlegen" ON public.zentrale_entries
  WITH CHECK (
    ((created_by IS NULL) OR (created_by = (select auth.uid())))
    AND (
      ((category = 'kontrollauftrag') AND public.is_genehmiger())
      OR ((category = 'lage') AND (public.can_manage_zentrale() OR public.is_zentralist_on_duty()))
      OR ((category <> 'kontrollauftrag') AND (category <> 'lage') AND public.can_manage_zentrale())
    )
  );
ALTER POLICY "Zentrale Einträge ändern" ON public.zentrale_entries
  USING (
    ((category = 'kontrollauftrag') AND (public.is_genehmiger() OR public.has_portal_area_access('aussendienst')))
    OR ((category = 'lage') AND (public.can_manage_zentrale() OR public.is_zentralist_on_duty()))
    OR ((category <> 'kontrollauftrag') AND (category <> 'lage') AND public.can_manage_zentrale())
  )
  WITH CHECK (
    ((category = 'kontrollauftrag') AND (public.is_genehmiger() OR public.has_portal_area_access('aussendienst')))
    OR ((category = 'lage') AND (public.can_manage_zentrale() OR public.is_zentralist_on_duty()))
    OR ((category <> 'kontrollauftrag') AND (category <> 'lage') AND public.can_manage_zentrale())
  );
ALTER POLICY "Zentrale Einträge löschen" ON public.zentrale_entries
  USING (
    ((category = 'kontrollauftrag') AND public.is_genehmiger())
    OR ((category = 'lage') AND (public.can_manage_zentrale() OR public.is_zentralist_on_duty()))
    OR ((category <> 'kontrollauftrag') AND (category <> 'lage') AND public.can_manage_zentrale())
  );
