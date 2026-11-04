// Koszyk w D1. Gość: koszyk po tokenie z ciasteczka pk_cart. Zalogowany: koszyk po customer_id.
import { computeTotals } from '../../public/assets/pricing.js';
import { cookie, CART_COOKIE } from './cookies.js';
import { randomToken } from './crypto.js';
import { nowIso } from './http.js';

const CART_TTL = 60 * 60 * 24 * 30; // 30 dni

export async function resolveCart(context, { create = false } = {}) {
  const { env, data } = context;
  const db = env.DB;

  if (data.customer) {
    let cart = await db.prepare('SELECT * FROM carts WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1')
      .bind(data.customer.id).first();
    if (!cart && create) {
      cart = await db.prepare('INSERT INTO carts (token, customer_id) VALUES (?, ?) RETURNING *')
        .bind(randomToken(), data.customer.id).first();
    }
    return cart;
  }

  const token = data.cookies[CART_COOKIE];
  if (token) {
    const cart = await db.prepare('SELECT * FROM carts WHERE token = ? AND customer_id IS NULL').bind(token).first();
    if (cart) return cart;
  }
  if (!create) return null;
  const fresh = randomToken();
  data.setCookies.push(cookie(CART_COOKIE, fresh, CART_TTL));
  return db.prepare('INSERT INTO carts (token) VALUES (?) RETURNING *').bind(fresh).first();
}

export const touchCart = (db, cartId) =>
  db.prepare('UPDATE carts SET updated_at = ? WHERE id = ?').bind(nowIso(), cartId);

export async function findCoupon(db, code) {
  if (!code) return null;
  return db.prepare(
    `SELECT code, kind, value, min_total_gr FROM coupons
      WHERE code = ? AND active = 1
        AND (valid_until IS NULL OR valid_until > ?)
        AND (max_uses IS NULL OR used < max_uses)`
  ).bind(code.trim(), nowIso()).first();
}

// Wariant z dostępną ilością (stan minus rezerwacje)
export function loadVariant(db, variantId) {
  return db.prepare(
    `SELECT v.id, v.sku, v.label, v.price_gr, v.stock, v.reserved, v.active,
            p.id AS product_id, p.active AS product_active, p.personalizable, p.type
       FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`
  ).bind(variantId).first();
}

export const availableQty = (v) => (v.stock === null ? 99 : Math.max(0, Math.min(99, v.stock - v.reserved)));

export async function cartView(db, cart) {
  if (!cart) return emptyView();
  const { results } = await db.prepare(
    `SELECT ci.id, ci.qty, ci.upload_id,
            v.id AS variant_id, v.sku, v.label, v.price_gr, v.stock, v.reserved,
            p.slug, p.name, p.type, p.shipping_class, p.personalizable, p.art_shape, p.art_tone, p.lead_time_days,
            u.filename AS upload_name, u.size AS upload_size, u.mime AS upload_mime
       FROM cart_items ci
       JOIN variants v ON v.id = ci.variant_id
       JOIN products p ON p.id = v.product_id
       LEFT JOIN uploads u ON u.id = ci.upload_id
      WHERE ci.cart_id = ? AND v.active = 1 AND p.active = 1
      ORDER BY ci.id`
  ).bind(cart.id).all();

  const lines = results.map((r) => {
    const available = availableQty(r);
    return {
      id: r.id,
      qty: r.qty,
      line_total_gr: r.price_gr * r.qty,
      problem: available < r.qty ? (available === 0 ? 'Produkt jest już niedostępny.' : `Dostępne tylko ${available} szt.`) : null,
      variant: { id: r.variant_id, sku: r.sku, label: r.label, price_gr: r.price_gr, max_qty: available },
      product: {
        slug: r.slug, name: r.name, type: r.type, shipping_class: r.shipping_class,
        personalizable: !!r.personalizable, lead_time_days: r.lead_time_days,
        art: { shape: r.art_shape, tone: r.art_tone }
      },
      upload: r.upload_id ? { id: r.upload_id, filename: r.upload_name, size: r.upload_size, mime: r.upload_mime } : null
    };
  });

  const coupon = await findCoupon(db, cart.coupon_code);
  const totals = computeTotals(lines, coupon);
  if (cart.coupon_code && !coupon) {
    totals.coupon = { code: cart.coupon_code, ok: false, message: 'Ten kod wygasł albo został wykorzystany.' };
  }
  return { lines, coupon_code: cart.coupon_code ?? null, totals };
}

function emptyView() {
  return { lines: [], coupon_code: null, totals: computeTotals([], null) };
}

// Po zalogowaniu: koszyk gościa trafia do koszyka klienta (ilości łączone, przycięte do stanu)
export async function mergeGuestCart(db, guestToken, customerId) {
  if (!guestToken) return;
  const guest = await db.prepare('SELECT * FROM carts WHERE token = ? AND customer_id IS NULL').bind(guestToken).first();
  if (!guest) return;
  const own = await db.prepare('SELECT * FROM carts WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 1').bind(customerId).first();
  if (!own) {
    await db.prepare('UPDATE carts SET customer_id = ?, updated_at = ? WHERE id = ?').bind(customerId, nowIso(), guest.id).run();
    return;
  }
  const { results: items } = await db.prepare('SELECT * FROM cart_items WHERE cart_id = ?').bind(guest.id).all();
  const stmts = [];
  for (const it of items) {
    stmts.push(db.prepare(
      `INSERT INTO cart_items (cart_id, variant_id, qty, upload_id) VALUES (?, ?, ?, ?)
       ON CONFLICT DO NOTHING`
    ).bind(own.id, it.variant_id, it.qty, it.upload_id));
  }
  stmts.push(db.prepare('UPDATE uploads SET cart_id = ? WHERE cart_id = ?').bind(own.id, guest.id));
  if (guest.coupon_code && !own.coupon_code) {
    stmts.push(db.prepare('UPDATE carts SET coupon_code = ? WHERE id = ?').bind(guest.coupon_code, own.id));
  }
  stmts.push(db.prepare('DELETE FROM carts WHERE id = ?').bind(guest.id));
  stmts.push(touchCart(db, own.id));
  await db.batch(stmts);
  await normalizeCart(db, own.id);
}

// Scala zdublowane pozycje (ten sam wariant i plik) i przycina ilości do dostępnych
export async function normalizeCart(db, cartId) {
  const { results } = await db.prepare(
    `SELECT ci.id, ci.variant_id, ci.qty, ci.upload_id, v.stock, v.reserved
       FROM cart_items ci JOIN variants v ON v.id = ci.variant_id WHERE ci.cart_id = ? ORDER BY ci.id`
  ).bind(cartId).all();
  const seen = new Map();
  const stmts = [];
  for (const r of results) {
    const key = `${r.variant_id}|${r.upload_id ?? ''}`;
    const prev = seen.get(key);
    if (prev) {
      prev.qty += r.qty;
      stmts.push(db.prepare('DELETE FROM cart_items WHERE id = ?').bind(r.id));
    } else {
      seen.set(key, { ...r });
    }
  }
  for (const r of seen.values()) {
    const qty = Math.max(1, Math.min(r.qty, availableQty(r) || 1));
    stmts.push(db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').bind(qty, r.id));
  }
  if (stmts.length) await db.batch(stmts);
}
