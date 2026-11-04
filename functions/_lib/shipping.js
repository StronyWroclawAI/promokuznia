// Przesyłki zamówienia: utworzenie w InPost, synchronizacja statusu z zamówieniem.
import { createShipment, getShipment, defaultParcel, inpostMode, statusLabel, isInTransit, isDelivered } from './inpost.js';
import { nowIso } from './http.js';

export const activeShipment = (db, orderId) =>
  db.prepare(`SELECT * FROM shipments WHERE order_id = ? AND status != 'canceled' ORDER BY id DESC LIMIT 1`).bind(orderId).first();

async function productsFor(db, orderId) {
  const { results } = await db.prepare(
    `SELECT i.variant_id, p.parcel_size, p.weight_g, p.length_cm, p.width_cm, p.height_cm
       FROM order_items i JOIN variants v ON v.id = i.variant_id JOIN products p ON p.id = v.product_id
      WHERE i.order_id = ? AND i.product_type = 'physical'`
  ).bind(orderId).all();
  return Object.fromEntries(results.map((r) => [r.variant_id, {
    parcel_size: r.parcel_size, weight_g: r.weight_g, dims: r.length_cm ? [r.length_cm, r.width_cm, r.height_cm] : null
  }]));
}

export async function suggestedParcel(db, order) {
  const { results: items } = await db.prepare(`SELECT variant_id, qty FROM order_items WHERE order_id = ? AND product_type = 'physical'`).bind(order.id).all();
  return defaultParcel(order, items, await productsFor(db, order.id));
}

// Parcel z formularza panelu (nadpisuje podpowiedź)
export function parcelFromBody(order, suggested, body) {
  if (order.shipping_method === 'paczkomat') {
    return { kind: 'template', size: ['A', 'B', 'C'].includes(body.size) ? body.size : suggested.size };
  }
  const num = (v, d, min, max) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= min && n <= max ? n : d; };
  return {
    kind: 'dimensions',
    weight_kg: num(body.weight_kg, suggested.weight_kg, 0.1, 30),
    length_cm: Math.round(num(body.length_cm, suggested.length_cm, 1, 350)),
    width_cm: Math.round(num(body.width_cm, suggested.width_cm, 1, 240)),
    height_cm: Math.round(num(body.height_cm, suggested.height_cm, 1, 240))
  };
}

export async function createOrderShipment(env, order, parcel) {
  if (!inpostMode(env)) throw new Error('InPost: brak INPOST_API_TOKEN i INPOST_ORGANIZATION_ID.');
  const s = await createShipment(env, order, parcel);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO shipments (order_id, carrier, service, external_id, tracking_number, cod_gr, status, status_label, payload_json, created_at, updated_at)
       VALUES (?, 'inpost', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(order.id, s.payload.service, s.id, s.tracking_number, order.payment_method === 'pobranie' ? order.total_gr : null,
      s.status, statusLabel(s.status), JSON.stringify(s.payload), nowIso(), nowIso()),
    env.DB.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, ?, ?, 'admin', ?)`)
      .bind(order.id, order.status, order.status,
        `Utworzono przesyłkę InPost${parcel.kind === 'template' ? ` (gabaryt ${parcel.size})` : ` (${parcel.weight_kg} kg)`}${s.tracking_number ? `, numer ${s.tracking_number}` : ''}${inpostMode(env) === 'symulator' ? ' — tryb testowy' : ''}.`)
  ]);
  return s;
}

// Pobiera aktualny status z InPost i przestawia zamówienie: nadana → „Wysłane”, doręczona → „Dostarczone”.
// Zwraca listę maili do wysłania (tylko „wysłane” — o doręczeniu klient wie sam).
export async function syncShipment(env, shipment, source) {
  const db = env.DB;
  const fresh = await getShipment(env, shipment);
  const mails = [];
  const stmts = [db.prepare('UPDATE shipments SET status = ?, status_label = ?, tracking_number = COALESCE(?, tracking_number), updated_at = ? WHERE id = ?')
    .bind(fresh.status, statusLabel(fresh.status), fresh.tracking_number, nowIso(), shipment.id)];
  const order = await db.prepare('SELECT id, status FROM orders WHERE id = ?').bind(shipment.order_id).first();
  const tracking = fresh.tracking_number ?? shipment.tracking_number;
  const ev = (from, to, note) => db.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, ?, ?, ?, ?)`).bind(order.id, from, to, source, note);

  // warunek w UPDATE — webhook i ręczne odświeżenie naraz nie przestawią zamówienia dwa razy
  if ((isInTransit(fresh.status) || isDelivered(fresh.status)) && order.status === 'w_realizacji') {
    const r = await db.prepare(`UPDATE orders SET status = 'wyslane' WHERE id = ? AND status = 'w_realizacji'`).bind(order.id).run();
    if (r.meta.changes === 1) {
      stmts.push(ev('w_realizacji', 'wyslane', `InPost: ${statusLabel(fresh.status)}, numer ${tracking}`));
      mails.push(['wyslane', { tracking }]);
      order.status = 'wyslane';
    }
  }
  if (isDelivered(fresh.status) && order.status === 'wyslane') {
    const r = await db.prepare(`UPDATE orders SET status = 'dostarczone' WHERE id = ? AND status = 'wyslane'`).bind(order.id).run();
    if (r.meta.changes === 1) {
      stmts.push(ev('wyslane', 'dostarczone', 'InPost: doręczona'));
      stmts.push(db.prepare(`UPDATE payments SET status = 'oplacona', updated_at = ? WHERE order_id = ? AND provider = 'pobranie' AND status = 'utworzona'`).bind(nowIso(), order.id));
    }
  }
  await db.batch(stmts);
  return { status: fresh.status, label: statusLabel(fresh.status), tracking, mails };
}
