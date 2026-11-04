import { json, problem, readJson } from '../../../_lib/http.js';
import { STATUS_LABEL } from '../../../_lib/orders.js';
import { availableActions, runAction, ActionError } from '../../../_lib/admin.js';

async function load(db, id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').bind(Number(id)).first();
}

async function detail(db, order) {
  const [items, events, payments, shipments, customer] = await db.batch([
    db.prepare(
      `SELECT i.id, i.name, i.variant_label, i.sku, i.unit_price_gr, i.vat_rate, i.qty, i.product_type, i.product_slug,
              i.project_status, i.upload_id, u.filename AS upload_name, u.size AS upload_size
         FROM order_items i LEFT JOIN uploads u ON u.id = i.upload_id WHERE i.order_id = ? ORDER BY i.id`
    ).bind(order.id),
    db.prepare('SELECT from_status, to_status, source, note, created_at FROM order_events WHERE order_id = ? ORDER BY id').bind(order.id),
    db.prepare('SELECT provider, provider_ref, provider_order, attempt, amount_gr, refunded_gr, status, created_at, updated_at FROM payments WHERE order_id = ? ORDER BY attempt, id').bind(order.id),
    db.prepare('SELECT carrier, service, tracking_number, status, updated_at FROM shipments WHERE order_id = ?').bind(order.id),
    db.prepare('SELECT email, first_name, created_at, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) AS orders FROM customers c WHERE id = ?').bind(order.customer_id ?? 0)
  ]);
  const payment = payments.results.at(-1) ?? null;
  return {
    id: order.id, number: order.number, status: order.status, status_label: STATUS_LABEL[order.status],
    created_at: order.created_at, email: order.email, phone: order.phone, note: order.customer_note,
    payment_method: order.payment_method, shipping_method: order.shipping_method, locker_code: order.locker_code,
    shipping: order.shipping_json ? JSON.parse(order.shipping_json) : null,
    billing: order.billing_json ? JSON.parse(order.billing_json) : null,
    reserved_until: order.reserved_until, digital_consent_at: order.digital_consent_at, terms_accepted_at: order.terms_accepted_at,
    totals: {
      subtotal_gr: order.subtotal_gr, discount_gr: order.discount_gr, shipping_gr: order.shipping_gr,
      total_gr: order.total_gr, vat_gr: order.vat_gr, coupon_code: order.coupon_code
    },
    customer: customer.results[0] ?? null,
    items: items.results.map((i) => ({ ...i, file_url: i.upload_id ? `/api/admin/uploads/${i.upload_id}` : null })),
    events: events.results.map((e) => ({ ...e, label: STATUS_LABEL[e.to_status] })),
    payments: payments.results,
    shipments: shipments.results,
    actions: availableActions(order, items.results, payment),
    refundable_gr: payment ? payment.amount_gr - payment.refunded_gr : 0
  };
}

// GET /api/admin/orders/:id
export async function onRequestGet({ env, params }) {
  const order = await load(env.DB, params.id);
  if (!order) return problem(404, 'Nie ma takiego zamówienia.');
  return json({ order: await detail(env.DB, order) });
}

// POST /api/admin/orders/:id  { action, note?, tracking_number?, amount_gr?, restock? }
export async function onRequestPost({ env, params, request }) {
  const body = await readJson(request);
  if (!body?.action) return problem(400, 'Nie wybrano akcji.');
  const order = await load(env.DB, params.id);
  if (!order) return problem(404, 'Nie ma takiego zamówienia.');
  try {
    const message = await runAction(env, order, String(body.action), body);
    return json({ message, order: await detail(env.DB, await load(env.DB, params.id)) });
  } catch (err) {
    if (err instanceof ActionError) return problem(err.status, err.message);
    if (String(err.message).startsWith('Stripe:')) return problem(502, `Stripe odrzucił zwrot: ${err.message.slice(8)}`);
    throw err;
  }
}
