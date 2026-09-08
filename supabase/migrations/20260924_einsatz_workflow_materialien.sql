-- Einsatzmittel & Training: Benutzermeldungen, Protokoll-Bemerkungen
-- und verwaltbare Schulungsunterlagen.

CREATE TABLE IF NOT EXISTS public.personal_einsatzmittel_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles (id),
  category text NOT NULL CHECK (category IN (
    'schutzweste', 'glock_17', 'munition', 'pfefferspray', 'schlagstock',
    'handfesseln', 'taschenlampe_kelle', 'leatherman', 'warnweste'
  )),
  verwahrungsort text CHECK (
    verwahrungsort IS NULL OR verwahrungsort IN (
      'lager', 'innendienst', 'peter_1', 'peter_2', 'peter_30',
      'spind_1', 'spind_2', 'waffentresor_zentrale', 'waffentresor_keller'
    )
  ),
  groesse text,
  ablaufdatum date,
  schutzfristen text,
  waffennummer text,
  service text,
  magazinanzahl integer CHECK (magazinanzahl IS NULL OR magazinanzahl >= 0),
  marke text,
  kaliber text,
  art text,
  patronen integer CHECK (patronen IS NULL OR patronen >= 0),
  ablauf_mm_yyyy text CHECK (
    ablauf_mm_yyyy IS NULL OR ablauf_mm_yyyy ~ '^(0[1-9]|1[0-2])/[0-9]{4}$'
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 1000),
  reviewed_by uuid REFERENCES public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personal_em_requests_requester
  ON public.personal_einsatzmittel_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_em_requests_pending
  ON public.personal_einsatzmittel_requests (created_at)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS personal_einsatzmittel_requests_updated_at ON public.personal_einsatzmittel_requests;
CREATE TRIGGER personal_einsatzmittel_requests_updated_at
  BEFORE UPDATE ON public.personal_einsatzmittel_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.personal_einsatzmittel_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.personal_einsatzmittel_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_einsatzmittel_requests TO authenticated;

CREATE POLICY "Eigene Einsatzmittel-Meldungen lesen"
  ON public.personal_einsatzmittel_requests FOR SELECT TO authenticated
  USING (
    public.can_manage_einsatzmittel()
    OR (
      public.has_portal_area_access('einsatz_mt')
      AND requester_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Eigene Einsatzmittel-Meldungen anlegen"
  ON public.personal_einsatzmittel_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.has_portal_area_access('einsatz_mt')
    AND requester_id = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

CREATE POLICY "Offene Einsatzmittel-Meldungen ändern"
  ON public.personal_einsatzmittel_requests FOR UPDATE TO authenticated
  USING (
    public.can_manage_einsatzmittel()
    OR (requester_id = (SELECT auth.uid()) AND status = 'pending')
  )
  WITH CHECK (
    public.can_manage_einsatzmittel()
    OR (
      requester_id = (SELECT auth.uid())
      AND status IN ('pending', 'withdrawn')
      AND review_note IS NULL
      AND reviewed_by IS NULL
      AND reviewed_at IS NULL
    )
  );

CREATE POLICY "Offene eigene Einsatzmittel-Meldungen löschen"
  ON public.personal_einsatzmittel_requests FOR DELETE TO authenticated
  USING (
    public.can_manage_einsatzmittel()
    OR (requester_id = (SELECT auth.uid()) AND status = 'pending')
  );

CREATE OR REPLACE FUNCTION public.review_personal_einsatzmittel_request(
  p_request_id uuid,
  p_approved boolean,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.personal_einsatzmittel_requests%ROWTYPE;
  v_item_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_einsatzmittel() THEN
    RAISE EXCEPTION 'Nicht berechtigt';
  END IF;

  SELECT * INTO v_request
  FROM public.personal_einsatzmittel_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Meldung ist nicht mehr offen';
  END IF;
  IF NOT p_approved AND length(trim(coalesce(p_note, ''))) = 0 THEN
    RAISE EXCEPTION 'Ablehnungsgrund erforderlich';
  END IF;
  IF length(coalesce(p_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Bemerkung zu lang';
  END IF;

  IF p_approved THEN
    INSERT INTO public.personal_einsatzmittel (
      category, officer_id, verwahrungsort, groesse, ablaufdatum, schutzfristen,
      waffennummer, service, magazinanzahl, marke, kaliber, art, patronen,
      ablauf_mm_yyyy, created_by
    ) VALUES (
      v_request.category, v_request.requester_id, v_request.verwahrungsort,
      v_request.groesse, v_request.ablaufdatum, v_request.schutzfristen,
      v_request.waffennummer, v_request.service, v_request.magazinanzahl,
      v_request.marke, v_request.kaliber, v_request.art, v_request.patronen,
      v_request.ablauf_mm_yyyy, auth.uid()
    )
    RETURNING id INTO v_item_id;
  END IF;

  UPDATE public.personal_einsatzmittel_requests
  SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      review_note = nullif(trim(coalesce(p_note, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;

  RETURN v_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_personal_einsatzmittel_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_personal_einsatzmittel_request(uuid, boolean, text) TO authenticated;

ALTER TABLE public.einsatz_training_attendance
  ADD COLUMN IF NOT EXISTS remark text;
ALTER TABLE public.einsatz_training_attendance
  DROP CONSTRAINT IF EXISTS einsatz_training_attendance_remark_length;
ALTER TABLE public.einsatz_training_attendance
  ADD CONSTRAINT einsatz_training_attendance_remark_length
  CHECK (remark IS NULL OR length(remark) <= 1000);

CREATE TABLE IF NOT EXISTS public.einsatz_material_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area text NOT NULL CHECK (area IN ('einsatzmittel', 'einsatztraining')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 40),
  description text CHECK (description IS NULL OR length(description) <= 300),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_einsatz_material_tabs_unique_active
  ON public.einsatz_material_tabs (area, lower(trim(name))) WHERE active;
CREATE INDEX IF NOT EXISTS idx_einsatz_material_tabs_order
  ON public.einsatz_material_tabs (area, active, sort_order, name);

DROP TRIGGER IF EXISTS einsatz_material_tabs_updated_at ON public.einsatz_material_tabs;
CREATE TRIGGER einsatz_material_tabs_updated_at
  BEFORE UPDATE ON public.einsatz_material_tabs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.einsatz_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id uuid NOT NULL REFERENCES public.einsatz_material_tabs (id),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  file_key text,
  file_name text,
  mime_type text,
  file_size bigint CHECK (file_size IS NULL OR file_size >= 0),
  external_url text,
  published boolean NOT NULL DEFAULT true,
  important boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by uuid REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT einsatz_material_source CHECK (
    (file_key IS NOT NULL AND external_url IS NULL)
    OR (file_key IS NULL AND external_url IS NOT NULL)
  ),
  CONSTRAINT einsatz_material_https_link CHECK (
    external_url IS NULL OR external_url ~* '^https://'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_einsatz_materials_file_key
  ON public.einsatz_materials (file_key) WHERE file_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_einsatz_materials_tab
  ON public.einsatz_materials (tab_id, archived_at, created_at DESC);

DROP TRIGGER IF EXISTS einsatz_materials_updated_at ON public.einsatz_materials;
CREATE TRIGGER einsatz_materials_updated_at
  BEFORE UPDATE ON public.einsatz_materials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.einsatz_material_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.einsatz_materials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.einsatz_material_tabs, public.einsatz_materials FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.einsatz_material_tabs, public.einsatz_materials TO authenticated;

CREATE POLICY "Unterlagen-Tabs lesen"
  ON public.einsatz_material_tabs FOR SELECT TO authenticated
  USING (
    public.has_portal_area_access('einsatz_mt')
    AND (active OR public.can_manage_einsatzmittel())
  );
CREATE POLICY "Unterlagen-Tabs anlegen"
  ON public.einsatz_material_tabs FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_einsatzmittel());
CREATE POLICY "Unterlagen-Tabs ändern"
  ON public.einsatz_material_tabs FOR UPDATE TO authenticated
  USING (public.can_manage_einsatzmittel())
  WITH CHECK (public.can_manage_einsatzmittel());
CREATE POLICY "Unterlagen-Tabs löschen"
  ON public.einsatz_material_tabs FOR DELETE TO authenticated
  USING (public.can_manage_einsatzmittel());

CREATE POLICY "Einsatz-Unterlagen lesen"
  ON public.einsatz_materials FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.einsatz_material_tabs t
      WHERE t.id = tab_id
        AND public.has_portal_area_access('einsatz_mt')
        AND (
          public.can_manage_einsatzmittel()
          OR (t.active AND published AND archived_at IS NULL)
        )
    )
  );
CREATE POLICY "Einsatz-Unterlagen anlegen"
  ON public.einsatz_materials FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_einsatzmittel());
CREATE POLICY "Einsatz-Unterlagen ändern"
  ON public.einsatz_materials FOR UPDATE TO authenticated
  USING (public.can_manage_einsatzmittel())
  WITH CHECK (public.can_manage_einsatzmittel());
CREATE POLICY "Einsatz-Unterlagen löschen"
  ON public.einsatz_materials FOR DELETE TO authenticated
  USING (public.can_manage_einsatzmittel());

INSERT INTO public.einsatz_material_tabs (area, name, description, sort_order)
SELECT seed.area, seed.name, seed.description, seed.sort_order
FROM (VALUES
  ('einsatzmittel', 'Allgemein', 'Allgemeine Unterlagen zu Einsatzmitteln', 0),
  ('einsatztraining', 'Allgemein', 'Allgemeine Unterlagen zum Einsatztraining', 0)
) AS seed(area, name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.einsatz_material_tabs existing
  WHERE existing.area = seed.area AND lower(trim(existing.name)) = lower(seed.name) AND existing.active
);
