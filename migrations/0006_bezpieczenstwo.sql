-- Etap 7: limity prób (logowanie, rejestracja, reset hasła, kasa, formularze)
CREATE TABLE rate_limits (
  key       TEXT PRIMARY KEY,      -- np. login:email:jan@example.com, login:ip:1.2.3.4
  count     INTEGER NOT NULL,
  reset_at  TEXT NOT NULL
);

-- Zgłoszenia odstąpienia od umowy przez formularz na stronie
CREATE TABLE withdrawals (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  email       TEXT NOT NULL,
  items_text  TEXT NOT NULL,
  account     TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_withdrawals_order ON withdrawals(order_id);
