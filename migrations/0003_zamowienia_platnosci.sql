-- Etap 4: kasa, zamówienia, płatności

ALTER TABLE orders ADD COLUMN access_token_hash TEXT;   -- link do zamówienia dla gościa (SHA-256 tokenu)
ALTER TABLE orders ADD COLUMN phone TEXT;
ALTER TABLE orders ADD COLUMN customer_note TEXT;
ALTER TABLE orders ADD COLUMN digital_consent_at TEXT;  -- zgoda na dostarczenie treści cyfrowej przed upływem 14 dni
CREATE UNIQUE INDEX idx_orders_access ON orders(access_token_hash);
CREATE INDEX idx_orders_reserved ON orders(status, reserved_until);

-- Tabela płatności od nowa: dochodzi dostawca „symulator” (bramka testowa bez kluczy),
-- kolumna z linkiem przekierowania i licznik prób. SQLite nie zmienia CHECK przez ALTER.
CREATE TABLE payments_new (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  provider        TEXT NOT NULL CHECK (provider IN ('stripe','przelewy24','przelew','pobranie','symulator')),
  provider_ref    TEXT,                       -- id sesji Stripe / sessionId P24 / token symulatora
  provider_order  TEXT,                       -- orderId P24, payment_intent Stripe
  redirect_url    TEXT,
  attempt         INTEGER NOT NULL DEFAULT 1,
  amount_gr       INTEGER NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('utworzona','oplacona','odrzucona','zwrocona','czesciowo_zwrocona')),
  refunded_gr     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
INSERT INTO payments_new (id, order_id, provider, provider_ref, amount_gr, status, refunded_gr, created_at)
  SELECT id, order_id, provider, provider_ref, amount_gr, status, refunded_gr, created_at FROM payments;
DROP TABLE payments;
ALTER TABLE payments_new RENAME TO payments;
CREATE INDEX idx_payments_ref ON payments(provider, provider_ref);
CREATE INDEX idx_payments_order ON payments(order_id, attempt);

ALTER TABLE order_items ADD COLUMN product_slug TEXT;
