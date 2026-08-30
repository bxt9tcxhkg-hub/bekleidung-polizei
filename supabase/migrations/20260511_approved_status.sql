-- Migration: 'approved' Status zwischen pending_approval und ordered_supplier
-- Führe dies in Supabase aus, falls die orders.status-Spalte ein CHECK-Constraint hat.
-- Falls status TEXT ohne Constraint ist, ist keine Migration nötig.

-- Beispiel für Enum-Update (nur falls status als enum definiert ist):
-- ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'approved' AFTER 'pending_approval';

-- Beispiel für CHECK-Constraint-Update (falls vorhanden):
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
-- ALTER TABLE orders ADD CONSTRAINT orders_status_check
--   CHECK (status IN ('pending','pending_approval','approved','ordered_supplier',
--                     'at_tailor','ready_for_issue','partially_issued','issued','cancelled'));
