import { json, problem, readJson } from '../_lib/http.js';
import { resolveCart, normalizeCart, cartView, findCoupon } from '../_lib/cart.js';
import { createOrderFromCart, releaseExpired, finalizeOrder, CheckoutError } from '../_lib/orders.js';
import { startPayment, providerFor, orderUrl } from '../_lib/payments.js';
import { computeTotals, shippingOptions, paymentOptions } from '../../public/assets/pricing.js';
import { notifyOrder, later } from '../_lib/mail.js';

// GET /api/checkout?shipping_method=…&payment_method=…
// Wycena koszyka dla wybranej dostawy i płatności + które bramki działają (symulator, gdy brak kluczy).
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const opts = { shipping_method: url.searchParams.get('shipping_method') || undefined, payment_method: url.searchParams.get('payment_method') || undefined };
  const cart = await resolveCart(context);
  const view = await cartView(env.DB, cart);
  const coupon = cart ? await findCoupon(env.DB, cart.coupon_code) : null;
  const providers = {};
  for (const m of ['stripe', 'przelewy24', 'przelew', 'pobranie']) providers[m] = providerFor(env, m);
  return json({
    demo: env.SHOP_MODE === 'demo',
    providers,
    cart: view,
    totals: computeTotals(view.lines, coupon, opts),
    shipping_options: shippingOptions(view.lines),
    payment_options: paymentOptions(view.lines, opts.shipping_method).map((p) => ({ ...p, provider: providers[p.method], available: p.available && !!providers[p.method] }))
  });
}

// POST /api/checkout — składa zamówienie z koszyka i zwraca, dokąd przekierować klienta
export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;
  const body = await readJson(request, 8192);
  if (!body) return problem(400, 'Nieprawidłowe dane żądania.');

  if (body.payment_method && !providerFor(env, body.payment_method)) {
    return problem(400, 'Ta metoda płatności jest chwilowo niedostępna. Wybierz inną.', { field: 'payment_method' });
  }

  await releaseExpired(db);
  const cart = await resolveCart(context);
  if (!cart) return problem(400, 'Koszyk jest pusty.');

  let created;
  try {
    created = await createOrderFromCart(context, cart, body);
  } catch (err) {
    if (err instanceof CheckoutError) {
      if (err.status === 409) await normalizeCart(db, cart.id);
      return problem(err.status, err.message, err.extra);
    }
    throw err;
  }
  const { order, accessToken } = created;
  const origin = new URL(request.url).origin;
  const viewUrl = orderUrl(origin, order.number, accessToken);
  const done = (redirect, extra = {}) =>
    json({ order: { number: order.number, access_token: accessToken }, redirect_url: redirect, ...extra }, { status: 201 });

  if (order.payment_method === 'pobranie') {
    await db.prepare(`INSERT INTO payments (order_id, provider, amount_gr, status) VALUES (?, 'pobranie', ?, 'utworzona')`)
      .bind(order.id, order.total_gr).run();
    await finalizeOrder(db, order.id, { source: 'klient', note: 'Płatność przy odbiorze — przekazane do realizacji.', paid: false });
    later(context, notifyOrder(env, origin, order.id, 'przyjete'));
    return done(viewUrl);
  }
  if (order.payment_method === 'przelew') {
    await db.prepare(`INSERT INTO payments (order_id, provider, amount_gr, status) VALUES (?, 'przelew', ?, 'utworzona')`)
      .bind(order.id, order.total_gr).run();
    later(context, notifyOrder(env, origin, order.id, 'przyjete'));
    return done(viewUrl);
  }

  try {
    const pay = await startPayment(context, order, accessToken);
    return done(pay.redirect_url);
  } catch (err) {
    console.error('startPayment', err?.message ?? err);
    // zamówienie zostaje — klient może ponowić płatność ze strony zamówienia
    return done(viewUrl, { warning: 'Zamówienie przyjęte, ale bramka płatności nie odpowiedziała. Spróbuj zapłacić ponownie na stronie zamówienia.' });
  }
}
