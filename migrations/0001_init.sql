-- PromoKuźnia — schemat bazy (Cloudflare D1 / SQLite)
-- Kwoty zawsze w groszach (INTEGER). Daty w ISO 8601 UTC (TEXT).
-- Uruchomienie: npx wrangler d1 migrations apply promokuznia-db --local

PRAGMA foreign_keys = ON;

-- ───────────── Katalog ─────────────

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  lead        TEXT,
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id              INTEGER PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  category_id     INTEGER NOT NULL REFERENCES categories(id),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('physical','digital','service','gift_card')),
  short           TEXT,
  description     TEXT,
  vat_rate        INTEGER,                    -- 23, 8, 5, 0; NULL = poza VAT w chwili sprzedaży (bon)
  personalizable  INTEGER NOT NULL DEFAULT 0, -- 1 = klient wgrywa plik / projekt
  lead_time_days  INTEGER NOT NULL DEFAULT 0,
  weight_g        INTEGER,                    -- produkty fizyczne
  length_cm       INTEGER,
  width_cm        INTEGER,
  height_cm       INTEGER,
  shipping_class  TEXT CHECK (shipping_class IN ('paczkomat','kurier') OR shipping_class IS NULL),
  parcel_size     TEXT CHECK (parcel_size IN ('A','B','C') OR parcel_size IS NULL),
  art_shape       TEXT,                       -- ilustracja zastępcza, dopóki nie ma zdjęć w R2
  art_tone        TEXT,
  specs_json      TEXT NOT NULL DEFAULT '[]', -- [["Papier","kreda 350 g/m²"], ...]
  badges_json     TEXT NOT NULL DEFAULT '[]',
  compare_at_gr   INTEGER,                    -- cena przed obniżką
  gpsr_json       TEXT,                       -- producent / importer (GPSR)
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_products_category ON products(category_id, active);

CREATE TABLE variants (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  price_gr    INTEGER NOT NULL CHECK (price_gr >= 0),
  stock       INTEGER,                        -- NULL = bez limitu (cyfrowe, usługi, bony)
  reserved    INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  sort        INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  CHECK (stock IS NULL OR stock >= reserved)  -- nie da się zarezerwować więcej, niż jest
);
CREATE INDEX idx_variants_product ON variants(product_id, sort);

CREATE TABLE product_images (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  r2_key      TEXT NOT NULL,
  alt         TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0
);

-- Dyrektywa Omnibus: najniższa cena z 30 dni przed obniżką
CREATE TABLE price_history (
  id          INTEGER PRIMARY KEY,
  variant_id  INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  price_gr    INTEGER NOT NULL,
  valid_from  TEXT NOT NULL
);
CREATE INDEX idx_price_history ON price_history(variant_id, valid_from);

-- ───────────── Klienci ─────────────

CREATE TABLE customers (
  id                INTEGER PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash     TEXT,                     -- PBKDF2 (Web Crypto); NULL = konto bez hasła / gość
  first_name        TEXT,
  last_name         TEXT,
  phone             TEXT,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  consent_at        TEXT,
  consent_text      TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE addresses (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('shipping','billing')),
  company      TEXT,
  nip          TEXT,
  name         TEXT NOT NULL,
  street       TEXT NOT NULL,
  postcode     TEXT NOT NULL CHECK (postcode GLOB '[0-9][0-9]-[0-9][0-9][0-9]'),
  city         TEXT NOT NULL,
  country      TEXT NOT NULL DEFAULT 'PL'
);

-- ───────────── Koszyk ─────────────

CREATE TABLE carts (
  id           INTEGER PRIMARY KEY,
  token        TEXT NOT NULL UNIQUE,          -- w ciasteczku HttpOnly
  customer_id  INTEGER REFERENCES customers(id),
  coupon_code  TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE cart_items (
  id            INTEGER PRIMARY KEY,
  cart_id       INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id    INTEGER NOT NULL REFERENCES variants(id),
  qty           INTEGER NOT NULL CHECK (qty > 0),
  upload_r2_key TEXT,                         -- plik do personalizacji
  UNIQUE (cart_id, variant_id, upload_r2_key)
);

-- ───────────── Zamówienia ─────────────

CREATE TABLE orders (
  id               INTEGER PRIMARY KEY,
  number           TEXT NOT NULL UNIQUE,      -- PK/2026/000123
  customer_id      INTEGER REFERENCES customers(id),
  email            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN (
                     'czeka_na_platnosc','oplacone','akceptacja_projektu','w_realizacji',
                     'wyslane','dostarczone','zrealizowane','anulowane','zwrocone')),
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('stripe','przelewy24','przelew','pobranie')),
  shipping_method  TEXT NOT NULL CHECK (shipping_method IN ('paczkomat','kurier_inpost','kurier_furgonetka','odbior','brak')),
  locker_code      TEXT,                      -- kod paczkomatu z Geowidgetu
  shipping_json    TEXT,                      -- snapshot adresu dostawy
  billing_json     TEXT,                      -- snapshot danych do faktury
  subtotal_gr      INTEGER NOT NULL,
  discount_gr      INTEGER NOT NULL DEFAULT 0,
  shipping_gr      INTEGER NOT NULL DEFAULT 0,
  gift_card_gr     INTEGER NOT NULL DEFAULT 0,
  total_gr         INTEGER NOT NULL,
  vat_gr           INTEGER NOT NULL,
  coupon_code      TEXT,
  invoice_id       TEXT,                      -- ID w Fakturowni
  invoice_url      TEXT,
  reserved_until   TEXT,                      -- po tym czasie Cron zwalnia rezerwację
  terms_accepted_at TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  CHECK (total_gr = subtotal_gr - discount_gr + shipping_gr - gift_card_gr)
);
CREATE INDEX idx_orders_status ON orders(status, created_at);
CREATE INDEX idx_orders_customer ON orders(customer_id, created_at);

CREATE TABLE order_items (
  id             INTEGER PRIMARY KEY,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id     INTEGER REFERENCES variants(id),
  product_type   TEXT NOT NULL,
  name           TEXT NOT NULL,               -- snapshot w chwili zakupu
  variant_label  TEXT NOT NULL,
  sku            TEXT NOT NULL,
  unit_price_gr  INTEGER NOT NULL,
  vat_rate       INTEGER,
  qty            INTEGER NOT NULL CHECK (qty > 0),
  upload_r2_key  TEXT,
  project_status TEXT CHECK (project_status IN ('czeka','zaakceptowany','do_poprawy') OR project_status IS NULL)
);

CREATE TABLE order_events (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('klient','webhook_platnosci','webhook_przewoznika','admin','cron')),
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_order_events ON order_events(order_id, created_at);

-- ───────────── Płatności ─────────────

CREATE TABLE payments (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  provider        TEXT NOT NULL CHECK (provider IN ('stripe','przelewy24','przelew','pobranie')),
  provider_ref    TEXT,                       -- checkout session id / sessionId P24
  amount_gr       INTEGER NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('utworzona','oplacona','odrzucona','zwrocona','czesciowo_zwrocona')),
  refunded_gr     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_payments_ref ON payments(provider, provider_ref);

-- Idempotencja webhooków: ten sam event drugi raz = nic się nie dzieje
CREATE TABLE payment_events (
  id            INTEGER PRIMARY KEY,
  provider      TEXT NOT NULL,
  event_id      TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  received_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE (provider, event_id)
);

-- ───────────── Wysyłki ─────────────

CREATE TABLE shipments (
  id              INTEGER PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id),
  carrier         TEXT NOT NULL CHECK (carrier IN ('inpost','furgonetka')),
  service         TEXT NOT NULL,              -- inpost_locker_standard, inpost_courier_standard, dpd...
  external_id     TEXT,                       -- ID przesyłki u przewoźnika
  tracking_number TEXT,
  label_r2_key    TEXT,
  cod_gr          INTEGER,                    -- kwota pobrania
  status          TEXT NOT NULL DEFAULT 'utworzona',
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX idx_shipments_tracking ON shipments(carrier, tracking_number);

-- ───────────── Rabaty, bony, pobrania ─────────────

CREATE TABLE coupons (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind          TEXT NOT NULL CHECK (kind IN ('procent','kwota','darmowa_dostawa')),
  value         INTEGER NOT NULL DEFAULT 0,   -- procent albo grosze
  min_total_gr  INTEGER NOT NULL DEFAULT 0,
  max_uses      INTEGER,
  used          INTEGER NOT NULL DEFAULT 0,
  valid_until   TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE gift_cards (
  id              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  order_item_id   INTEGER REFERENCES order_items(id),
  initial_gr      INTEGER NOT NULL,
  balance_gr      INTEGER NOT NULL CHECK (balance_gr >= 0),
  valid_until     TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE TABLE downloads (
  id             INTEGER PRIMARY KEY,
  order_item_id  INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  r2_key         TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  max_downloads  INTEGER NOT NULL DEFAULT 5,
  downloads      INTEGER NOT NULL DEFAULT 0
);
