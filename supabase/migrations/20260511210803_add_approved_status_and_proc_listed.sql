
-- approved-Status im CHECK-Constraint ergänzen
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'pending_approval', 'approved',
    'ordered_supplier', 'at_tailor', 'ready_for_issue',
    'partially_issued', 'issued', 'cancelled'
  ]));

-- proc_listed Spalte hinzufügen
ALTER TABLE orders ADD COLUMN IF NOT EXISTS proc_listed BOOLEAN DEFAULT false;
