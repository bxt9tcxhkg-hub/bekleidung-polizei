-- Abdeckende Indizes für die neuen Fremdschlüssel des Einsatz-Workflows.

CREATE INDEX IF NOT EXISTS idx_personal_em_requests_reviewed_by
  ON public.personal_einsatzmittel_requests (reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_einsatz_material_tabs_created_by
  ON public.einsatz_material_tabs (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_einsatz_materials_created_by
  ON public.einsatz_materials (created_by)
  WHERE created_by IS NOT NULL;
