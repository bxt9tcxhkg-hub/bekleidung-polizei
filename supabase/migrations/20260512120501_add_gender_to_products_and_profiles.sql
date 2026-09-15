
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'unisex'
    CHECK (gender IN ('male', 'female', 'unisex'));

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'male'
    CHECK (gender IN ('male', 'female'));
