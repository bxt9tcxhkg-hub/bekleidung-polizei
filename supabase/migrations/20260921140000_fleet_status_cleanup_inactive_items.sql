-- Fuhrpark: "Ausstattungsstück löschen" setzt fleet_equipment_items.active
-- auf false (weiches Löschen), lässt aber den zugehörigen Status-Eintrag
-- (fleet_equipment_status) unangetastet stehen. FleetVehicle.tsx selbst
-- filtert beim Anzeigen korrekt auf aktive Items, aber vier andere Stellen
-- (Portal-Banner, Fleet-Übersicht, "Mein Fahrzeug"-Karte, Mängel-Liste)
-- zählen offene Status-Einträge ohne diesen Filter - ein deaktiviertes
-- Testitem ("Test" beim Mercedes-Benz Vito) blieb dadurch dauerhaft als
-- offene Aufgabe sichtbar. Gleiches Muster bei fleet_check_items/
-- fleet_check_item_status (Füllliste), vorsorglich mit erledigt.

-- Bestehende verwaiste Status-Einträge aufräumen.
DELETE FROM public.fleet_equipment_status s
USING public.fleet_equipment_items i
WHERE s.item_id = i.id AND i.active = false;

DELETE FROM public.fleet_check_item_status s
USING public.fleet_check_items i
WHERE s.item_id = i.id AND i.active = false;

-- Künftige Deaktivierungen räumen den Status automatisch mit auf.
CREATE OR REPLACE FUNCTION public.cleanup_inactive_fleet_equipment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active = false AND OLD.active = true THEN
    DELETE FROM public.fleet_equipment_status WHERE item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_inactive_fleet_equipment_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cleanup_inactive_fleet_equipment_status ON public.fleet_equipment_items;
CREATE TRIGGER cleanup_inactive_fleet_equipment_status
  AFTER UPDATE ON public.fleet_equipment_items
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_inactive_fleet_equipment_status();

CREATE OR REPLACE FUNCTION public.cleanup_inactive_fleet_check_item_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.active = false AND OLD.active = true THEN
    DELETE FROM public.fleet_check_item_status WHERE item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_inactive_fleet_check_item_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cleanup_inactive_fleet_check_item_status ON public.fleet_check_items;
CREATE TRIGGER cleanup_inactive_fleet_check_item_status
  AFTER UPDATE ON public.fleet_check_items
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_inactive_fleet_check_item_status();
