-- Einsatzmittel: Beschaffung von Pool-Einsatzmitteln (gemeinsame Ausrüstung)
-- ist ab jetzt eine Entscheidung des Genehmigers. Der Sachbearbeiter stellt
-- weiterhin fest bzw. trackt, was vorhanden ist (Bearbeiten, Ausbuchen bleibt
-- unverändert Sachbearbeiter-Aufgabe), meldet aber Bedarf nur noch als
-- Beschaffungsantrag; erst der Genehmiger entscheidet per RPC
-- decide_pool_einsatzmittel_request über die tatsächliche Anschaffung
-- (oder lehnt sie ab). Bei Genehmigung entsteht atomar der Pool-Eintrag
-- (Details wie Waffennummer trägt der Sachbearbeiter danach wie gewohnt nach).

CREATE TABLE public.pool_einsatzmittel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  category text NOT NULL CHECK (category IN (
    'langwaffe_stg77',
    'magazine',
    'munition',
    'pfefferspray_gross',
    'schild',
    'ballistischer_helm',
    'schwere_westen',
    'spuckschutzhaube'
  )),
  verwahrungsort text NOT NULL CHECK (verwahrungsort IN (
    'lager',
    'innendienst',
    'peter_1',
    'peter_2',
    'peter_30'
  )),
  anzahl integer NOT NULL CHECK (anzahl > 0),
  begruendung text NOT NULL CHECK (length(begruendung) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 500),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pool_einsatzmittel_requests_requested_by_idx
  ON public.pool_einsatzmittel_requests (requested_by, created_at DESC);
CREATE INDEX pool_einsatzmittel_requests_pending_idx
  ON public.pool_einsatzmittel_requests (created_at) WHERE status = 'pending';

DROP TRIGGER IF EXISTS pool_einsatzmittel_requests_updated_at ON public.pool_einsatzmittel_requests;
CREATE TRIGGER pool_einsatzmittel_requests_updated_at
  BEFORE UPDATE ON public.pool_einsatzmittel_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.pool_einsatzmittel_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pool_einsatzmittel_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.pool_einsatzmittel_requests TO authenticated;

CREATE POLICY "Beschaffungsanträge lesen" ON public.pool_einsatzmittel_requests FOR SELECT TO authenticated
 USING (public.can_manage_einsatzmittel());

CREATE POLICY "Beschaffungsanträge anlegen" ON public.pool_einsatzmittel_requests FOR INSERT TO authenticated
 WITH CHECK (
   public.can_manage_einsatzmittel()
   AND requested_by = (SELECT auth.uid())
   AND status = 'pending'
   AND reviewed_by IS NULL AND reviewed_at IS NULL
 );

-- Nur der Antragsteller kann einen noch offenen Antrag zurückziehen; die
-- eigentliche Entscheidung (genehmigen/ablehnen) läuft ausschließlich über
-- die RPC unten, nicht über UPDATE.
CREATE POLICY "Offene Beschaffungsanträge zurückziehen" ON public.pool_einsatzmittel_requests FOR UPDATE TO authenticated
 USING (requested_by = (SELECT auth.uid()) AND status = 'pending')
 WITH CHECK (
   requested_by = (SELECT auth.uid()) AND status = 'withdrawn'
   AND review_note IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL
 );

CREATE OR REPLACE FUNCTION public.decide_pool_einsatzmittel_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.pool_einsatzmittel_requests%ROWTYPE;
  v_item_id uuid;
  i integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_genehmiger() THEN
    RAISE EXCEPTION 'Nicht berechtigt';
  END IF;

  SELECT * INTO v_request FROM public.pool_einsatzmittel_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Antrag ist nicht mehr offen';
  END IF;
  IF NOT p_approve AND length(trim(coalesce(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Ablehnungsgrund erforderlich';
  END IF;
  IF length(coalesce(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'Bemerkung zu lang';
  END IF;

  IF p_approve THEN
    -- Langwaffen werden einzeln mit eigener Waffennummer geführt (kein
    -- anzahl-Feld) - je genehmigtem Stück entsteht eine eigene Zeile, die
    -- der Sachbearbeiter danach mit Waffennummer etc. befüllt. Alle
    -- übrigen Kategorien führen die Menge in einer Zeile.
    IF v_request.category = 'langwaffe_stg77' THEN
      FOR i IN 1..v_request.anzahl LOOP
        INSERT INTO public.pool_einsatzmittel (category, verwahrungsort, created_by)
        VALUES (v_request.category, v_request.verwahrungsort, auth.uid())
        RETURNING id INTO v_item_id;
      END LOOP;
    ELSE
      INSERT INTO public.pool_einsatzmittel (category, verwahrungsort, anzahl, created_by)
      VALUES (v_request.category, v_request.verwahrungsort, v_request.anzahl, auth.uid())
      RETURNING id INTO v_item_id;
    END IF;
  END IF;

  UPDATE public.pool_einsatzmittel_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      review_note = nullif(trim(coalesce(p_note, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_pool_einsatzmittel_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_pool_einsatzmittel_request(uuid, boolean, text) TO authenticated;

-- Direktes Anlegen neuer Pool-Einsatzmittel (= der eigentliche Kauf) ist ab
-- jetzt dem Genehmiger vorbehalten; Bearbeiten und Ausbuchen bestehender
-- Zeilen (reines Tracking) bleiben unverändert Sachbearbeiter-Aufgabe.
DROP POLICY IF EXISTS "Pool-Einsatzmittel schreiben" ON public.pool_einsatzmittel;
CREATE POLICY "Pool-Einsatzmittel anlegen" ON public.pool_einsatzmittel FOR INSERT TO authenticated
 WITH CHECK (public.is_genehmiger());
