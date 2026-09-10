CREATE OR REPLACE FUNCTION public.receive_stock_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.stock_orders%ROWTYPE; tailoring boolean;
BEGIN
  IF NOT (has_role('admin') OR has_role('sachbearbeiter')) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO target FROM stock_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lagerbestellung nicht gefunden'; END IF;
  IF target.status='received' THEN RETURN; END IF;
  IF target.status<>'approved' THEN RAISE EXCEPTION 'Lagerbestellung ist nicht genehmigt'; END IF;
  SELECT needs_tailoring INTO tailoring FROM products WHERE id=target.product_id;
  IF NOT coalesce(tailoring,false) THEN PERFORM adjust_inventory(target.product_id,target.size,target.quantity); END IF;
  UPDATE stock_orders SET status='received',received_at=now(),updated_at=now() WHERE id=target.id;
END $$;
REVOKE ALL ON FUNCTION public.receive_stock_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_stock_order(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.book_order_inventory(p_order_id uuid,p_expected_updated_at timestamptz,p_action text,p_quantity integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE target public.orders%ROWTYPE; tailoring boolean; delta integer:=0; available integer; stock integer;
  next_status text; job_id uuid;
BEGIN
  IF NOT (has_role('admin') OR has_role('sachbearbeiter')) THEN RAISE EXCEPTION 'Keine Berechtigung'; END IF;
  SELECT * INTO target FROM orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bestellung nicht gefunden'; END IF;
  IF target.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'Bestellung wurde geändert. Bitte neu laden.'; END IF;
  SELECT needs_tailoring INTO tailoring FROM products WHERE id=target.product_id;
  IF p_action='issue' THEN
    IF target.status NOT IN ('ready_for_issue','partially_issued') THEN RAISE EXCEPTION 'Bestellung ist nicht ausgabebereit'; END IF;
    available:=coalesce(target.quantity_received,target.quantity)-coalesce(target.quantity_issued,0);
    IF p_quantity IS NULL OR p_quantity<1 OR p_quantity>available THEN RAISE EXCEPTION 'Ungültige Ausgabemenge'; END IF;
    target.quantity_issued:=coalesce(target.quantity_issued,0)+p_quantity;
    target.status:=CASE WHEN p_quantity=available THEN 'issued' ELSE 'partially_issued' END;
    IF NOT coalesce(tailoring,false) THEN delta:=-p_quantity; END IF;
  ELSIF p_action='receive' THEN
    IF target.status<>'ordered_supplier' OR p_quantity IS NULL OR p_quantity<0 THEN RAISE EXCEPTION 'Ungültiger Wareneingang'; END IF;
    target.quantity_received:=p_quantity;
    target.status:=CASE WHEN tailoring THEN 'at_tailor' ELSE 'ready_for_issue' END;
    IF tailoring THEN
      PERFORM 1 FROM quarters WHERE id=target.quarter_id FOR UPDATE;
      SELECT id INTO job_id FROM tailor_jobs WHERE quarter_id=target.quarter_id AND status='open' LIMIT 1;
      IF job_id IS NULL THEN INSERT INTO tailor_jobs(quarter_id,status) VALUES(target.quarter_id,'open') RETURNING id INTO job_id; END IF;
      target.tailor_job_id:=job_id;
    ELSE delta:=p_quantity;
    END IF;
  ELSIF p_action='step_back' THEN
    next_status:=CASE target.status
      WHEN 'ordered_supplier' THEN 'approved'
      WHEN 'at_tailor' THEN 'ordered_supplier'
      WHEN 'ready_for_issue' THEN CASE WHEN tailoring THEN 'at_tailor' ELSE 'ordered_supplier' END
      WHEN 'partially_issued' THEN 'ready_for_issue'
      WHEN 'issued' THEN 'ready_for_issue'
      WHEN 'cancelled' THEN 'approved' END;
    IF next_status IS NULL THEN RAISE EXCEPTION 'Kein vorheriger Status'; END IF;
    IF target.status IN ('issued','partially_issued') THEN
      IF NOT coalesce(tailoring,false) THEN delta:=coalesce(target.quantity_issued,0); END IF;
      target.quantity_issued:=NULL;
    ELSIF target.status='ready_for_issue' AND NOT coalesce(tailoring,false) THEN
      delta:=-coalesce(target.quantity_received,0);
      target.quantity_received:=NULL;
    ELSIF target.status='ordered_supplier' THEN target.quantity_received:=NULL;
    END IF;
    IF target.status='cancelled' THEN target.cancel_reason:=NULL; END IF;
    target.status:=next_status;
  ELSE RAISE EXCEPTION 'Unbekannte Buchung'; END IF;
  IF delta<0 THEN
    SELECT quantity INTO stock FROM inventory WHERE product_id=target.product_id AND size=target.size FOR UPDATE;
    IF NOT FOUND OR stock < -delta THEN RAISE EXCEPTION 'Nicht genügend freier Lagerbestand'; END IF;
  END IF;
  IF delta<>0 THEN PERFORM adjust_inventory(target.product_id,target.size,delta); END IF;
  UPDATE orders SET status=target.status,quantity_received=target.quantity_received,quantity_issued=target.quantity_issued,
    tailor_job_id=target.tailor_job_id,cancel_reason=target.cancel_reason,updated_at=clock_timestamp() WHERE id=target.id;
END $$;
REVOKE ALL ON FUNCTION public.book_order_inventory(uuid,timestamptz,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.book_order_inventory(uuid,timestamptz,text,integer) TO authenticated;
