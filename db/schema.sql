
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  collection TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  image TEXT NOT NULL,
  profile TEXT,
  short TEXT,
  top_note TEXT,
  heart_note TEXT,
  base_note TEXT,
  vessel TEXT,
  weight_grams INTEGER NOT NULL DEFAULT 650,
  width_cm NUMERIC(8,2) NOT NULL DEFAULT 9,
  height_cm NUMERIC(8,2) NOT NULL DEFAULT 9,
  length_cm NUMERIC(8,2) NOT NULL DEFAULT 9,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  payment_id TEXT,
  preference_id TEXT,
  buyer JSONB NOT NULL,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  shipping JSONB NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  stock_applied BOOLEAN NOT NULL DEFAULT FALSE,
  email_confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE,
  email_paid_sent BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
