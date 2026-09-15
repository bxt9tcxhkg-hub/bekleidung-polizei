ALTER TABLE public.strassenzustand_strassen
  ADD COLUMN start_lat double precision,
  ADD COLUMN start_lng double precision,
  ADD COLUMN end_lat double precision,
  ADD COLUMN end_lng double precision,
  ADD COLUMN path jsonb;
