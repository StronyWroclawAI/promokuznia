-- Etap 3: sesje klientów, reset hasła, pliki do personalizacji

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,               -- SHA-256 tokenu z ciasteczka (sam token nie trafia do bazy)
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expires_at   TEXT NOT NULL
);
CREATE INDEX idx_sessions_customer ON sessions(customer_id);

CREATE TABLE password_resets (
  token_hash   TEXT PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at   TEXT NOT NULL,
  used_at      TEXT
);

CREATE TABLE uploads (
  id           TEXT PRIMARY KEY,               -- UUID
  r2_key       TEXT NOT NULL UNIQUE,
  cart_id      INTEGER REFERENCES carts(id) ON DELETE SET NULL,
  filename     TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_uploads_cart ON uploads(cart_id);

ALTER TABLE cart_items ADD COLUMN upload_id TEXT REFERENCES uploads(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN upload_id TEXT REFERENCES uploads(id);

CREATE INDEX idx_carts_customer ON carts(customer_id);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
