ALTER TABLE public.incident_reports ADD COLUMN location_lat double precision CHECK (location_lat IS NULL OR location_lat BETWEEN -90 AND 90);
ALTER TABLE public.incident_reports ADD COLUMN location_lng double precision CHECK (location_lng IS NULL OR location_lng BETWEEN -180 AND 180);
