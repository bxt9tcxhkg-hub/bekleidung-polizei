-- Tabellen eines fremden Projekts (Kaffee-/Verkaufsautomaten) entfernen —
-- gehören nicht zur Bekleidungsverwaltung (Freigabe durch Benutzer am 2026-07-02)
DROP TABLE IF EXISTS public.vending_kontrollen CASCADE;
DROP TABLE IF EXISTS public.powder_measurements CASCADE;
DROP TABLE IF EXISTS public.powder_settings CASCADE;
DROP TABLE IF EXISTS public.bean_logs CASCADE;
DROP TABLE IF EXISTS public.bean_settings CASCADE;
DROP TABLE IF EXISTS public.machine_slots CASCADE;
DROP TABLE IF EXISTS public.machines CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.articles CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
