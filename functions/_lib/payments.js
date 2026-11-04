// Płatności: Stripe Checkout, Przelewy24 (REST v1) i symulator bramki do demo bez kluczy.
// Bez bibliotek — zwykły fetch + Web Crypto, żeby było widać, co dokładnie idzie do operatora.
import { randomToken } from './crypto.js';
import { nowIso } from './http.js';
import { finalizeOrder } from './orders.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha384 = async (text) => hex(await crypto.subtle.digest('SHA-384', enc.encode(text)));
async function hmacSha256(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Który operator obsłuży wybraną metodę. Bez kluczy, w trybie demo, płatność przejmuje symulator.
export function providerFor(env, method) {
  if (method === 'stripe') return env.STRIPE_SECRET_KEY ? 'stripe' : env.SHOP_MODE === 'demo' ? 'symulator' : null;
  if (method === 'przelewy24') return env.P24_MERCHANT_ID && env.P24_API_KEY && env.P24_CRC ? 'przelewy24' : env.SHOP_MODE === 'demo' ? 'symulator' : null;
  if (method === 'przelew' || method === 'pobranie') return method;
  return null;
}

export function orderUrl(origin, number, accessToken) {
  const q = new URLSearchParams({ zamowienie: number });
  if (accessToken) q.set('t', accessToken);
  return `${origin}/?${q}#zamowienie`;
}

// Nowa próba płatności dla zamówienia. Zwraca { redirect_url } albo null (przelew, pobranie).
export async function startPayment(context, order, accessToken) {
  const { env, request } = context;
  const db = env.DB;
  const origin = new URL(request.url).origin;
  const provider = providerFor(env, order.payment_method);
  if (!provider) throw new Error(`Metoda płatności ${order.payment_method} nie jest skonfigurowana.`);

  const last = await db.prepare('SELECT MAX(attempt) AS n FROM payments WHERE order_id = ?').bind(order.id).first();
  const attempt = (last?.n ?? 0) + 1;
  const returnUrl = orderUrl(origin, order.number, accessToken);

  let ref = null;
  let providerOrder = null;
  let redirect = null;

  if (provider === 'stripe') {
    const session = await stripeCreateSession(env, order, attempt, returnUrl);
    ref = session.id;
    redirect = session.url;
  } else if (provider === 'przelewy24') {
    ref = `${order.number.replace(/\//g, '-')}-${attempt}`;
    redirect = await p24Register(env, order, ref, returnUrl, `${origin}/api/webhooks/przelewy24`);
  } else if (provider === 'symulator') {
    ref = `sim_${randomToken(18)}`;
    const q = new URLSearchParams({ platnosc: ref });
    if (accessToken) q.set('t', accessToken);
    redirect = `${origin}/?${q}#symulator-platnosci`;
  }

  await db.batch([
    // poprzednie niedokończone próby tracą ważność
    db.prepare(`UPDATE payments SET status = 'odrzucona', updated_at = ? WHERE order_id = ? AND status = 'utworzona'`).bind(nowIso(), order.id),
    db.prepare(
      `INSERT INTO payments (order_id, provider, provider_ref, provider_order, redirect_url, attempt, amount_gr, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'utworzona')`
    ).bind(order.id, provider, ref, providerOrder, redirect, attempt, order.total_gr)
  ]);
  return { provider, redirect_url: redirect };
}

// Wspólne zakończenie: kwota się zgadza → zamówienie opłacone. Każde zdarzenie operatora zapisujemy raz.
export async function recordEvent(db, provider, eventId, payload) {
  const r = await db.prepare(
    'INSERT INTO payment_events (provider, event_id, payload_json) VALUES (?, ?, ?) ON CONFLICT (provider, event_id) DO NOTHING'
  ).bind(provider, eventId, JSON.stringify(payload).slice(0, 20000)).run();
  return r.meta.changes === 1; // false = już przetworzone
}

export async function markPaymentPaid(db, payment, { amount_gr, provider_order, source_note }) {
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(payment.order_id).first();
  if (amount_gr !== order.total_gr) {
    await db.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, ?, ?, 'webhook_platnosci', ?)`)
      .bind(order.id, order.status, order.status, `Kwota płatności ${amount_gr} gr nie zgadza się z zamówieniem (${order.total_gr} gr) — do wyjaśnienia.`).run();
    return { ok: false, reason: 'amount_mismatch' };
  }
  await db.prepare(`UPDATE payments SET status = 'oplacona', provider_order = COALESCE(?, provider_order), updated_at = ? WHERE id = ?`)
    .bind(provider_order ?? null, nowIso(), payment.id).run();
  const result = await finalizeOrder(db, order.id, { source: 'webhook_platnosci', note: source_note });
  if (!result.finalized && order.status === 'anulowane') {
    await db.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, 'anulowane', 'anulowane', 'webhook_platnosci', ?)`)
      .bind(order.id, 'Wpłata przyszła po anulowaniu zamówienia — zwróć pieniądze z panelu operatora.').run();
  }
  return { ok: true, ...result };
}

export async function markPaymentFailed(db, payment, note) {
  await db.batch([
    db.prepare(`UPDATE payments SET status = 'odrzucona', updated_at = ? WHERE id = ? AND status = 'utworzona'`).bind(nowIso(), payment.id),
    db.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note)
                SELECT id, status, status, 'webhook_platnosci', ? FROM orders WHERE id = ?`).bind(note, payment.order_id)
  ]);
}

// ───────────── Stripe ─────────────

async function stripeCreateSession(env, order, attempt, returnUrl) {
  const p = new URLSearchParams();
  p.set('mode', 'payment');
  p.set('locale', 'pl');
  p.set('customer_email', order.email);
  p.set('client_reference_id', order.number);
  p.set('metadata[order_number]', order.number);
  p.set('payment_intent_data[metadata][order_number]', order.number);
  p.set('line_items[0][quantity]', '1');
  p.set('line_items[0][price_data][currency]', 'pln');
  p.set('line_items[0][price_data][unit_amount]', String(order.total_gr));
  p.set('line_items[0][price_data][product_data][name]', `Zamówienie ${order.number} — PromoKuźnia`);
  // Bez STRIPE_METHODS Stripe pokazuje metody włączone w panelu (Settings → Payment methods).
  // Z nią — tylko podane, np. card,blik,p24 (każda musi być aktywna na koncie, inaczej sesja się nie utworzy).
  if (env.STRIPE_METHODS) for (const m of env.STRIPE_METHODS.split(',')) p.append('payment_method_types[]', m.trim());
  p.set('success_url', returnUrl);
  p.set('cancel_url', returnUrl);
  p.set('expires_at', String(Math.floor(Date.now() / 1000) + 31 * 60)); // minimum Stripe to 30 min

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': `order-${order.id}-attempt-${attempt}`
    },
    body: p
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${data?.error?.message ?? res.status}`);
  return data;
}

// Zwrot przez Stripe (pełny albo częściowy). Klucz idempotencji chroni przed podwójnym zwrotem przy powtórzonym kliknięciu.
export async function stripeRefund(env, paymentIntent, amountGr, idempotencyKey) {
  const p = new URLSearchParams({ payment_intent: paymentIntent, amount: String(amountGr), reason: 'requested_by_customer' });
  const res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': idempotencyKey
    },
    body: p
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${data?.error?.message ?? res.status}`);
  return data;
}

// Nagłówek Stripe-Signature: t=<czas>,v1=<hmac>[,v1=...]. Podpisany tekst to `${t}.${surowe ciało}`.
export async function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  if (!header || !secret) return false;
  let t = null;
  const sigs = [];
  for (const kv of header.split(',')) {
    const [k, v] = kv.trim().split('=');
    if (k === 't') t = v;
    if (k === 'v1' && v) sigs.push(v);
  }
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = await hmacSha256(secret, `${t}.${rawBody}`);
  return sigs.some((s) => safeEqual(s, expected));
}

// ───────────── Przelewy24 (REST API v1) ─────────────

const p24Base = (env) => (env.P24_SANDBOX === '0' ? 'https://secure.przelewy24.pl' : 'https://sandbox.przelewy24.pl');
const p24Auth = (env) => `Basic ${btoa(`${env.P24_POS_ID || env.P24_MERCHANT_ID}:${env.P24_API_KEY}`)}`;

async function p24Register(env, order, sessionId, urlReturn, urlStatus) {
  const merchantId = Number(env.P24_MERCHANT_ID);
  const posId = Number(env.P24_POS_ID || env.P24_MERCHANT_ID);
  const sign = await sha384(JSON.stringify({ sessionId, merchantId, amount: order.total_gr, currency: 'PLN', crc: env.P24_CRC }));
  const res = await fetch(`${p24Base(env)}/api/v1/transaction/register`, {
    method: 'POST',
    headers: { authorization: p24Auth(env), 'content-type': 'application/json' },
    body: JSON.stringify({
      merchantId, posId, sessionId, amount: order.total_gr, currency: 'PLN',
      description: `Zamówienie ${order.number}`, email: order.email, country: 'PL', language: 'pl',
      urlReturn, urlStatus, timeLimit: 30, waitForResult: true, sign
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.data?.token) throw new Error(`Przelewy24: ${data?.error ?? res.status}`);
  return `${p24Base(env)}/trnRequest/${data.data.token}`;
}

// Powiadomienie P24: sprawdzamy podpis, a potem i tak potwierdzamy transakcję zapytaniem verify.
export async function p24VerifyNotification(env, n) {
  const expected = await sha384(JSON.stringify({
    merchantId: n.merchantId, posId: n.posId, sessionId: n.sessionId, amount: n.amount, originAmount: n.originAmount,
    currency: n.currency, orderId: n.orderId, methodId: n.methodId, statement: n.statement, crc: env.P24_CRC
  }));
  if (!safeEqual(String(n.sign ?? ''), expected)) return false;
  if (Number(n.merchantId) !== Number(env.P24_MERCHANT_ID)) return false;
  return true;
}

export async function p24ConfirmTransaction(env, n) {
  const sign = await sha384(JSON.stringify({ sessionId: n.sessionId, orderId: n.orderId, amount: n.amount, currency: n.currency, crc: env.P24_CRC }));
  const res = await fetch(`${p24Base(env)}/api/v1/transaction/verify`, {
    method: 'PUT',
    headers: { authorization: p24Auth(env), 'content-type': 'application/json' },
    body: JSON.stringify({
      merchantId: Number(env.P24_MERCHANT_ID), posId: Number(env.P24_POS_ID || env.P24_MERCHANT_ID),
      sessionId: n.sessionId, amount: n.amount, currency: n.currency, orderId: n.orderId, sign
    })
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data?.data?.status === 'success';
}
