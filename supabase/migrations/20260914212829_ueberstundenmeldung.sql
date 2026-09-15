CREATE TABLE public.ueberstunden_meldungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beamter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  datum date NOT NULL,
  zeit_von time,
  zeit_bis time,
  grund text NOT NULL CHECK (length(trim(grund)) BETWEEN 1 AND 500),
  std_werktag_50 numeric(5,2) NOT NULL DEFAULT 0 CHECK (std_werktag_50 >= 0),
  std_sonn_100 numeric(5,2) NOT NULL DEFAULT 0 CHECK (std_sonn_100 >= 0),
  std_19_22 numeric(5,2) NOT NULL DEFAULT 0 CHECK (std_19_22 >= 0),
  std_22_06 numeric(5,2) NOT NULL DEFAULT 0 CHECK (std_22_06 >= 0),
  std_sonn_200 numeric(5,2) NOT NULL DEFAULT 0 CHECK (std_sonn_200 >= 0),
  status text NOT NULL DEFAULT 'entwurf' CHECK (status IN ('entwurf','eingereicht','genehmigt','abgelehnt')),
  eingereicht_at timestamptz,
  genehmiger_id uuid REFERENCES public.profiles(id),
  genehmigt_at timestamptz,
  genehmiger_note text CHECK (genehmiger_note IS NULL OR length(genehmiger_note) <= 1000),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ueberstunden_meldungen_beamter_idx ON public.ueberstunden_meldungen(beamter_id);
CREATE INDEX ueberstunden_meldungen_eingereicht_idx ON public.ueberstunden_meldungen(status) WHERE status = 'eingereicht';
CREATE TRIGGER ueberstunden_meldungen_updated_at BEFORE UPDATE ON public.ueberstunden_meldungen FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.ueberstunden_meldungen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ueberstunden_meldungen FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ueberstunden_meldungen TO authenticated;

CREATE POLICY "Überstundenmeldungen lesen" ON public.ueberstunden_meldungen FOR SELECT TO authenticated
 USING (beamter_id = (SELECT auth.uid()) OR public.is_genehmiger());

CREATE POLICY "Überstundenmeldungen anlegen" ON public.ueberstunden_meldungen FOR INSERT TO authenticated
 WITH CHECK (
   beamter_id = (SELECT auth.uid()) AND created_by = (SELECT auth.uid())
   AND status = 'entwurf' AND eingereicht_at IS NULL
   AND genehmiger_id IS NULL AND genehmigt_at IS NULL AND genehmiger_note IS NULL
 );

CREATE POLICY "Überstundenmeldungen ändern" ON public.ueberstunden_meldungen FOR UPDATE TO authenticated
 USING (beamter_id = (SELECT auth.uid()) OR public.is_genehmiger())
 WITH CHECK (beamter_id = (SELECT auth.uid()) OR public.is_genehmiger());

CREATE POLICY "Überstundenmeldungen löschen" ON public.ueberstunden_meldungen FOR DELETE TO authenticated
 USING ((beamter_id = (SELECT auth.uid()) AND status = 'entwurf') OR public.is_genehmiger());

CREATE OR REPLACE FUNCTION public.enforce_ueberstunden_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF public.is_genehmiger() AND NEW.beamter_id <> (SELECT auth.uid()) THEN
    IF OLD.status <> 'eingereicht' THEN
      RAISE EXCEPTION 'Nur eine eingereichte Meldung kann entschieden werden.';
    END IF;
    IF NEW.status NOT IN ('genehmigt','abgelehnt') THEN
      RAISE EXCEPTION 'Der Genehmiger kann eine Meldung nur genehmigen oder ablehnen.';
    END IF;
    IF NEW.beamter_id IS DISTINCT FROM OLD.beamter_id
      OR NEW.datum IS DISTINCT FROM OLD.datum
      OR NEW.zeit_von IS DISTINCT FROM OLD.zeit_von
      OR NEW.zeit_bis IS DISTINCT FROM OLD.zeit_bis
      OR NEW.grund IS DISTINCT FROM OLD.grund
      OR NEW.std_werktag_50 IS DISTINCT FROM OLD.std_werktag_50
      OR NEW.std_sonn_100 IS DISTINCT FROM OLD.std_sonn_100
      OR NEW.std_19_22 IS DISTINCT FROM OLD.std_19_22
      OR NEW.std_22_06 IS DISTINCT FROM OLD.std_22_06
      OR NEW.std_sonn_200 IS DISTINCT FROM OLD.std_sonn_200
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.eingereicht_at IS DISTINCT FROM OLD.eingereicht_at
    THEN
      RAISE EXCEPTION 'Der Genehmiger kann nur über die Meldung entscheiden, nicht ihre Angaben ändern.';
    END IF;
  ELSE
    IF OLD.status NOT IN ('entwurf','eingereicht') THEN
      RAISE EXCEPTION 'Eine bereits entschiedene Meldung kann nicht mehr geändert werden.';
    END IF;
    IF NEW.status NOT IN ('entwurf','eingereicht') THEN
      RAISE EXCEPTION 'Der Status kann nur vom Genehmiger auf genehmigt/abgelehnt gesetzt werden.';
    END IF;
    IF NEW.genehmiger_id IS DISTINCT FROM OLD.genehmiger_id
      OR NEW.genehmigt_at IS DISTINCT FROM OLD.genehmigt_at
      OR NEW.genehmiger_note IS DISTINCT FROM OLD.genehmiger_note
      OR NEW.beamter_id IS DISTINCT FROM OLD.beamter_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Diese Felder können nur vom Genehmiger geändert werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ueberstunden_meldungen_update_check
  BEFORE UPDATE ON public.ueberstunden_meldungen
  FOR EACH ROW EXECUTE FUNCTION public.enforce_ueberstunden_update();
