-- Benutzer dürfen Größe und Menge einer eingereichten Bestellung ändern,
-- solange der Sachbearbeiter sie noch nicht beim Lieferanten bestellt hat.
-- Die Änderung läuft absichtlich über eine eng begrenzte RPC statt über eine
-- breite UPDATE-Policy, damit Preis, Produkt, Benutzer und Workflow-Felder
-- nicht vom Client manipuliert werden können.

CREATE OR REPLACE FUNCTION public.update_editable_order(
  p_order_id uuid,
  p_size text,
  p_quantity integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  target public.orders%ROWTYPE;
  order_year integer;
  total_budget_amount numeric;
  used_adjustment_amount numeric;
  other_orders_amount numeric;
  new_status text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Ungültige Menge';
  END IF;

  IF p_size IS NULL OR btrim(p_size) = '' THEN
    RAISE EXCEPTION 'Ungültige Größe';
  END IF;

  SELECT * INTO target
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND OR target.user_id <> uid THEN
    RAISE EXCEPTION 'Bestellung nicht gefunden';
  END IF;

  IF target.status NOT IN ('approved', 'pending_approval')
     OR target.delivery_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bestellung wurde bereits bestellt';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = target.product_id
      AND p_size = ANY (p.sizes)
  ) THEN
    RAISE EXCEPTION 'Größe ist für diesen Artikel nicht verfügbar';
  END IF;

  order_year := extract(year FROM target.created_at)::integer;

  SELECT coalesce(
    (SELECT ub.total_budget
     FROM public.user_budgets ub
     WHERE ub.user_id = uid
       AND ub.year = order_year
       AND ub.valid_from <= current_date
     ORDER BY ub.valid_from DESC
     LIMIT 1),
    350
  ) INTO total_budget_amount;

  SELECT coalesce(
    (SELECT ub.used_adjustment
     FROM public.user_budgets ub
     WHERE ub.user_id = uid
       AND ub.year = order_year
       AND ub.valid_from <= current_date
     ORDER BY ub.valid_from DESC
     LIMIT 1),
    0
  ) INTO used_adjustment_amount;

  SELECT coalesce(sum(o.unit_price * o.quantity), 0)
  INTO other_orders_amount
  FROM public.orders o
  WHERE o.user_id = uid
    AND o.id <> target.id
    AND o.status NOT IN ('pending', 'cancelled')
    AND o.created_at >= make_date(order_year, 1, 1)
    AND o.created_at < make_date(order_year + 1, 1, 1);

  new_status := CASE
    WHEN other_orders_amount + used_adjustment_amount + target.unit_price * p_quantity > total_budget_amount
      THEN 'pending_approval'
    ELSE 'approved'
  END;

  UPDATE public.orders
  SET size = p_size,
      quantity = p_quantity,
      status = new_status,
      updated_at = now()
  WHERE id = target.id;

  INSERT INTO public.audit_log (action, details, user_id)
  VALUES (
    'Bestellung durch Benutzer geändert',
    format('Bestellung %s: Größe %s → %s, Menge %s → %s', target.id, target.size, p_size, target.quantity, p_quantity),
    uid
  );

  RETURN new_status;
END;
$$;

REVOKE ALL ON FUNCTION public.update_editable_order(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_editable_order(uuid, text, integer) TO authenticated;
