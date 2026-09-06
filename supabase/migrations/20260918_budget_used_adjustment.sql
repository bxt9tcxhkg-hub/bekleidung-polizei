-- Verbrauchskorrektur je Budgetzeile (Kalenderjahr + valid_from).
-- Bestellsumme bleibt die Buchhaltung; used_adjustment korrigiert den angezeigten Verbrauch.
-- Rückstellung zum 01.01.: Abfrage immer nach user_budgets.year — Vorjahr gilt nicht für das neue Jahr.

ALTER TABLE public.user_budgets
  ADD COLUMN IF NOT EXISTS used_adjustment numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_budgets.used_adjustment IS
  'Korrektur zum Bestellverbrauch dieses Kalenderjahres. Rückstellung zum 01.01.';

-- Warenkorb-Einreichung: Verbrauch = Bestellungen des Jahres + aktuelle Jahreskorrektur
CREATE OR REPLACE FUNCTION public.submit_cart()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  yr int := extract(year from now())::int;
  total numeric;
  used numeric;
  cart numeric;
  new_status text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND active = true) THEN
    RAISE EXCEPTION 'Konto deaktiviert';
  END IF;
  SELECT coalesce(
    (SELECT total_budget FROM user_budgets
     WHERE user_id = uid AND year = yr AND valid_from <= current_date
     ORDER BY valid_from DESC LIMIT 1), 350) INTO total;
  SELECT coalesce(sum(unit_price * quantity), 0) + coalesce(
    (SELECT used_adjustment FROM user_budgets
     WHERE user_id = uid AND year = yr AND valid_from <= current_date
     ORDER BY valid_from DESC LIMIT 1), 0) INTO used
    FROM orders
    WHERE user_id = uid AND status NOT IN ('pending', 'cancelled')
      AND created_at >= make_date(yr, 1, 1);
  SELECT coalesce(sum(unit_price * quantity), 0) INTO cart
    FROM orders WHERE user_id = uid AND status = 'pending';
  IF cart = 0 THEN RETURN NULL; END IF;
  new_status := CASE WHEN used + cart > total THEN 'pending_approval' ELSE 'approved' END;
  UPDATE orders SET status = new_status, updated_at = now()
    WHERE user_id = uid AND status = 'pending';
  RETURN new_status;
END $$;
REVOKE ALL ON FUNCTION public.submit_cart() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_cart() TO authenticated;
