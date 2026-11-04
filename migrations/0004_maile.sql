-- Etap 6: maile. Link do zamówienia w każdym mailu (wysyłka, zwrot…) potrzebuje tokenu dostępu,
-- więc trzymamy go jawnie obok hasha (jak „order key” w WooCommerce). Daje dostęp tylko do podglądu
-- jednego zamówienia; hash zostaje do sprawdzania linków.
ALTER TABLE orders ADD COLUMN access_token TEXT;

-- Dziennik wysłanych maili: co, do kogo, wynik — widoczny w panelu przy zamówieniu
CREATE TABLE emails (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL,
  to_email     TEXT NOT NULL,
  subject      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('wyslany','blad','pominiety')),
  provider_id  TEXT,
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_emails_order ON emails(order_id, created_at);
