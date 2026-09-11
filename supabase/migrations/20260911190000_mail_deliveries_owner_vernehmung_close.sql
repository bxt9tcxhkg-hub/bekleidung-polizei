-- RSa/RSb-Übersicht wird zum allgemeinen Kontaktversuchs-Register für schwer
-- erreichbare Personen erweitert: zusätzlicher Typ "Vernehmung", Akteneigentümer
-- automatisch = Ersteller (kein manueller Auswahlschritt mehr), und ein
-- zweistufiger Erledigt-Workflow:
--   1) Feld-Aktion (Zugestellt/Durchgeführt/...) -> verschwindet aus der offenen
--      Arbeitsliste, bleibt aber für den Akteneigentümer als Rückmeldung sichtbar.
--   2) Akteneigentümer schließt den Akt endgültig (close_mail_delivery) -> Eintrag
--      verschwindet vollständig aus der allgemeinen Übersicht.

ALTER TABLE public.mail_deliveries DROP CONSTRAINT mail_deliveries_kind_check;
ALTER TABLE public.mail_deliveries ADD CONSTRAINT mail_deliveries_kind_check
  CHECK (kind IN ('rsa','rsb','vernehmung'));

ALTER TABLE public.mail_deliveries DROP CONSTRAINT mail_deliveries_status_check;
ALTER TABLE public.mail_deliveries ADD CONSTRAINT mail_deliveries_status_check
  CHECK (status IN ('offen','zugestellt','schriftlich_in_kenntnis','nicht_angetroffen','spaeter_erneut','durchgefuehrt'));

ALTER TABLE public.mail_deliveries
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX mail_deliveries_open_idx ON public.mail_deliveries(closed_at) WHERE closed_at IS NULL;

-- Akteneigentümer ist automatisch, wer den Eintrag erfasst hat — keine manuelle Auswahl.
CREATE OR REPLACE FUNCTION public.default_mail_delivery_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.akteneigentuemer_id IS NULL THEN
    NEW.akteneigentuemer_id := NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mail_deliveries_default_owner BEFORE INSERT ON public.mail_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.default_mail_delivery_owner();

-- Endgültiges Schließen: nur der Akteneigentümer oder die Verwaltung, nur nachdem
-- eine Feld-Aktion stattgefunden hat (nicht direkt aus "offen" heraus).
CREATE OR REPLACE FUNCTION public.close_mail_delivery(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_owner uuid; v_status text;
BEGIN
  SELECT akteneigentuemer_id, status INTO v_owner, v_status FROM public.mail_deliveries WHERE id=p_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Eintrag nicht gefunden';
  END IF;
  IF v_status = 'offen' THEN
    RAISE EXCEPTION 'Erst nach einer Rückmeldung (z. B. zugestellt, durchgeführt) kann der Akt geschlossen werden.';
  END IF;
  IF (SELECT auth.uid()) IS DISTINCT FROM v_owner AND NOT public.can_manage_zentrale() THEN
    RAISE EXCEPTION 'Nur der Akteneigentümer oder die Verwaltung kann den Akt schließen.';
  END IF;
  UPDATE public.mail_deliveries SET closed_at=now(), closed_by=(SELECT auth.uid()) WHERE id=p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.close_mail_delivery(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.close_mail_delivery(uuid) TO authenticated;
