
CREATE TABLE public.stock_orders (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id    UUID        NOT NULL REFERENCES public.products(id),
  size          TEXT        NOT NULL,
  quantity      INTEGER     NOT NULL CHECK (quantity > 0),
  status        TEXT        NOT NULL DEFAULT 'pending_approval'
                            CHECK (status IN ('pending_approval', 'approved', 'rejected', 'received')),
  note          TEXT,
  requested_by  UUID        NOT NULL REFERENCES public.profiles(id),
  approved_by   UUID        REFERENCES public.profiles(id),
  approved_at   TIMESTAMPTZ,
  received_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_orders_read" ON public.stock_orders
  FOR SELECT USING (true);

CREATE POLICY "stock_orders_insert" ON public.stock_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "stock_orders_update" ON public.stock_orders
  FOR UPDATE USING (true);
