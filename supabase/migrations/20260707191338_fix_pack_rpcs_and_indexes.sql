-- 1. Atomare Bestandsbuchung (verhindert Lost Updates beim Wareneingang)
CREATE OR REPLACE FUNCTION public.adjust_inventory(p_product uuid, p_size text, p_delta int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_qty int;
BEGIN
  IF NOT (has_role('admin') OR has_role('sachbearbeiter')) THEN
    RAISE EXCEPTION 'Keine Berechtigung';
  END IF;
  INSERT INTO inventory (product_id, size, quantity, updated_at)
  VALUES (p_product, p_size, greatest(p_delta, 0), now())
  ON CONFLICT (product_id, size)
  DO UPDATE SET quantity = greatest(inventory.quantity + p_delta, 0), updated_at = now()
  RETURNING quantity INTO new_qty;
  RETURN new_qty;
END $$;
REVOKE ALL ON FUNCTION public.adjust_inventory(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory(uuid, text, int) TO authenticated;

-- 2. Warenkorb serverseitig einreichen: Budget-Entscheidung passiert atomar in der DB,
--    nicht mehr mit potenziell veralteten Client-Daten
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
  SELECT coalesce(
    (SELECT total_budget FROM user_budgets
     WHERE user_id = uid AND year = yr AND valid_from <= current_date
     ORDER BY valid_from DESC LIMIT 1), 350) INTO total;
  SELECT coalesce(sum(unit_price * quantity), 0) INTO used
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

-- 3. Fehlende Foreign-Key-Indizes (Performance-Advisor)
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_by ON public.deliveries(created_by);
CREATE INDEX IF NOT EXISTS idx_grundausstattung_created_by ON public.grundausstattung(created_by);
CREATE INDEX IF NOT EXISTS idx_grundausstattung_product_id ON public.grundausstattung(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_tailor_job_id ON public.orders(tailor_job_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_quarter_id ON public.orders(quarter_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_shoe_refund_caps_created_by ON public.shoe_refund_caps(created_by);
CREATE INDEX IF NOT EXISTS idx_shoe_refunds_created_by ON public.shoe_refunds(created_by);
CREATE INDEX IF NOT EXISTS idx_shoe_refunds_reviewed_by ON public.shoe_refunds(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_shoe_refunds_user_id ON public.shoe_refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_orders_approved_by ON public.stock_orders(approved_by);
CREATE INDEX IF NOT EXISTS idx_stock_orders_product_id ON public.stock_orders(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_orders_requested_by ON public.stock_orders(requested_by);
CREATE INDEX IF NOT EXISTS idx_tailor_jobs_quarter_id ON public.tailor_jobs(quarter_id);
