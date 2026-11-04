-- Etap 5: przesyłki InPost
ALTER TABLE shipments ADD COLUMN payload_json TEXT;      -- co poszło do ShipX (gabaryt, pobranie) — do etykiety testowej i wglądu
ALTER TABLE shipments ADD COLUMN status_label TEXT;      -- status po polsku do panelu
ALTER TABLE shipments ADD COLUMN created_at TEXT;
CREATE INDEX idx_shipments_external ON shipments(carrier, external_id);
CREATE INDEX idx_shipments_order ON shipments(order_id);
