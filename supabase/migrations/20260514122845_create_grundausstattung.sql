
CREATE TABLE grundausstattung (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation TEXT NOT NULL CHECK (organisation IN ('Stadtpolizei', 'Parkaufsicht')),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organisation, product_id, size)
);
