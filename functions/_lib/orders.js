// Zamówienia: tworzenie z koszyka (jedna transakcja), finalizacja po płatności, wygaszanie rezerwacji.
import { computeTotals, shippingOptions, paymentOptions } from '../../public/assets/pricing.js';
import { cartView, findCoupon } from './cart.js';
import { randomToken, sha256 } from './crypto.js';
import { nowIso } from './http.js';
import { isEmail, normalizeEmail } from './auth.js';

const MIN = 60 * 1000;
// Rezerwacja towaru: płatność online 35 min (sesja Stripe/P24 wygasa po 30), przelew 3 dni
const RESERVE_ONLINE_MS = 35 * MIN;
const RESERVE_TRANSFER_MS = 3 * 24 * 60 * MIN;

export const STATUS_LABEL = {
  czeka_na_platnosc: 'Czeka na płatność', oplacone: 'Opłacone', akceptacja_projektu: 'Akceptacja projektu',
  w_realizacji: 'W realizacji', wyslane: 'Wysłane', dostarczone: 'Dostarczone', zrealizowane: 'Zrealizowane',
  anulowane: 'Anulowane', zwrocone: 'Zwrócone'
};

export class CheckoutError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const POSTCODE = /^\d{2}-\d{3}$/;
const PHONE = /^\+?[\d\s-]{9,16}$/;
const LOCKER = /^[A-Z]{3}\d{2,3}[A-Z]{1,2}$/;   // np. WRO01M, KRA123A

// Suma kontrolna NIP (wagi 6,5,7,2,3,4,5,6,7)
export function validNip(nip) {
  const d = String(nip).replace(/\D/g, '');
  if (d.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((s, x, i) => s + x * Number(d[i]), 0);
  return sum % 11 === Number(d[9]);
}

// Walidacja danych z formularza kasy. Zwraca czyste dane albo rzuca CheckoutError z nazwą pola.
export function validateCheckout(body, lines) {
  const fail = (field, message) => { throw new CheckoutError(400, message, { field }); };
  const email = normalizeEmail(body.email);
  if (!isEmail(email)) fail('email', 'Podaj poprawny adres e-mail.');
  const phone = str(body.phone, 20);
  const physical = lines.some((l) => l.product.type === 'physical');
  const digital = lines.some((l) => l.product.type === 'digital');

  const ship = shippingOptions(lines);
  let shippingMethod = 'brak';
  let shippingAddress = null;
  let lockerCode = null;
  if (physical) {
    const opt = ship.find((o) => o.method === body.shipping_method);
    if (!opt) fail('shipping_method', 'Wybierz sposób dostawy.');
    if (!opt.available) fail('shipping_method', opt.reason);
    shippingMethod = opt.method;
    if (!PHONE.test(phone)) fail('phone', 'Podaj numer telefonu — przewoźnik wyśle na niego SMS.');
    const name = str(body.ship_name, 80);
    if (name.length < 3) fail('ship_name', 'Podaj imię i nazwisko odbiorcy.');
    if (opt.needs === 'locker') {
      lockerCode = str(body.locker_code, 12).toUpperCase();
      if (!LOCKER.test(lockerCode)) fail('locker_code', 'Podaj kod Paczkomatu, np. WRO01M.');
      shippingAddress = { name };
    } else if (opt.needs === 'address') {
      const street = str(body.ship_street, 120);
      const postcode = str(body.ship_postcode, 6);
      const city = str(body.ship_city, 60);
      if (street.length < 3) fail('ship_street', 'Podaj ulicę i numer.');
      if (!POSTCODE.test(postcode)) fail('ship_postcode', 'Kod pocztowy w formacie 00-000.');
      if (city.length < 2) fail('ship_city', 'Podaj miejscowość.');
      shippingAddress = { name, street, postcode, city, country: 'PL' };
    } else {
      shippingAddress = { name };
    }
  }

  const pay = paymentOptions(lines, shippingMethod).find((p) => p.method === body.payment_method);
  if (!pay) fail('payment_method', 'Wybierz sposób płatności.');
  if (!pay.available) fail('payment_method', pay.reason);

  let billing = null;
  if (body.invoice === true) {
    const company = str(body.bill_company, 120);
    const nip = str(body.bill_nip, 13).replace(/[\s-]/g, '');
    const street = str(body.bill_street, 120);
    const postcode = str(body.bill_postcode, 6);
    const city = str(body.bill_city, 60);
    if (company.length < 2) fail('bill_company', 'Podaj nazwę firmy.');
    if (!validNip(nip)) fail('bill_nip', 'Ten NIP jest niepoprawny. Sprawdź cyfry.');
    if (street.length < 3) fail('bill_street', 'Podaj adres firmy.');
    if (!POSTCODE.test(postcode)) fail('bill_postcode', 'Kod pocztowy w formacie 00-000.');
    if (city.length < 2) fail('bill_city', 'Podaj miejscowość.');
    billing = { company, nip, street, postcode, city, country: 'PL' };
  }

  if (body.terms !== true) fail('terms', 'Zaakceptuj regulamin, żeby złożyć zamówienie.');
  if (digital && body.digital_consent !== true) {
    fail('digital_consent', 'Przy produktach cyfrowych potrzebujemy zgody na dostarczenie ich od razu.');
  }

  return {
    email, phone: phone || null, shippingMethod, shippingAddress, lockerCode, billing,
    paymentMethod: pay.method, note: str(body.note, 500) || null, digitalConsent: digital
  };
}

// Zamówienie z koszyka. Wszystko w jednym db.batch — D1 wykonuje go jako transakcję:
// jeśli rezerwacja choć jednego wariantu przekroczy stan (CHECK stock >= reserved), nic się nie zapisze.
export async function createOrderFromCart(context, cart, body) {
  const { env, data } = context;
  const db = env.DB;

  const view = await cartView(db, cart);
  if (!view.lines.length) throw new CheckoutError(400, 'Koszyk jest pusty.');
  const bad = view.lines.find((l) => l.problem);
  if (bad) throw new CheckoutError(409, `${bad.product.name}: ${bad.problem} Popraw ilość w koszyku.`);

  const input = validateCheckout(body, view.lines);
  const coupon = await findCoupon(db, cart.coupon_code);
  const totals = computeTotals(view.lines, coupon, { shipping_method: input.shippingMethod, payment_method: input.paymentMethod });
  if (Number.isInteger(body.expected_total_gr) && body.expected_total_gr !== totals.total_gr) {
    throw new CheckoutError(409, 'Kwota zamówienia zmieniła się, bo zmieniły się ceny lub dostępność. Sprawdź podsumowanie i zamów ponownie.', { total_gr: totals.total_gr });
  }
  const couponUsed = totals.coupon?.ok ? totals.coupon.code : null;

  const online = input.paymentMethod === 'stripe' || input.paymentMethod === 'przelewy24';
  const reservedUntil = input.paymentMethod === 'pobranie' ? null
    : nowIso(online ? RESERVE_ONLINE_MS : RESERVE_TRANSFER_MS);
  const tmpNumber = `tmp-${randomToken(12)}`;
  const accessToken = randomToken(24);
  const accessHash = await sha256(accessToken);
  const orderIdSql = '(SELECT id FROM orders WHERE number = ?)';

  const stmts = [
    db.prepare(
      `INSERT INTO orders (number, customer_id, email, phone, status, payment_method, shipping_method, locker_code,
         shipping_json, billing_json, subtotal_gr, discount_gr, shipping_gr, gift_card_gr, total_gr, vat_gr,
         coupon_code, reserved_until, terms_accepted_at, digital_consent_at, customer_note, access_token_hash)
       VALUES (?, ?, ?, ?, 'czeka_na_platnosc', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      tmpNumber, data.customer?.id ?? null, input.email, input.phone, input.paymentMethod, input.shippingMethod,
      input.lockerCode, input.shippingAddress ? JSON.stringify(input.shippingAddress) : null,
      input.billing ? JSON.stringify(input.billing) : null,
      totals.subtotal_gr, totals.discount_gr, totals.shipping?.price_gr ?? 0, totals.total_gr, totals.vat_gr,
      couponUsed, reservedUntil, nowIso(), input.digitalConsent ? nowIso() : null, input.note, accessHash
    ),
    // pozycje: kopia nazw i cen z chwili zakupu
    db.prepare(
      `INSERT INTO order_items (order_id, variant_id, product_type, product_slug, name, variant_label, sku,
         unit_price_gr, vat_rate, qty, upload_id, upload_r2_key, project_status)
       SELECT ${orderIdSql}, v.id, p.type, p.slug, p.name, v.label, v.sku, v.price_gr, p.vat_rate, ci.qty,
              ci.upload_id, u.r2_key, CASE WHEN p.personalizable = 1 THEN 'czeka' END
         FROM cart_items ci
         JOIN variants v ON v.id = ci.variant_id
         JOIN products p ON p.id = v.product_id
         LEFT JOIN uploads u ON u.id = ci.upload_id
        WHERE ci.cart_id = ?
        ORDER BY ci.id`
    ).bind(tmpNumber, cart.id),
    // rezerwacja stanów — przy braku towaru CHECK przerwie całą transakcję
    db.prepare(
      `UPDATE variants
          SET reserved = reserved + (SELECT SUM(qty) FROM cart_items WHERE cart_id = ? AND variant_id = variants.id)
        WHERE stock IS NOT NULL AND id IN (SELECT variant_id FROM cart_items WHERE cart_id = ?)`
    ).bind(cart.id, cart.id),
    db.prepare(
      `INSERT INTO order_events (order_id, from_status, to_status, source, note)
       VALUES (${orderIdSql}, NULL, 'czeka_na_platnosc', 'klient', ?)`
    ).bind(tmpNumber, `Zamówienie złożone, płatność: ${input.paymentMethod}`),
    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').bind(cart.id),
    db.prepare('UPDATE carts SET coupon_code = NULL WHERE id = ?').bind(cart.id),
    // numer czytelny dla ludzi: PK/2026/000042
    db.prepare(`UPDATE orders SET number = printf('PK/%s/%06d', strftime('%Y', 'now'), id) WHERE number = ?`).bind(tmpNumber)
  ];
  if (couponUsed) {
    stmts.splice(4, 0, db.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').bind(couponUsed));
  }

  try {
    await db.batch(stmts);
  } catch (err) {
    if (/CHECK constraint failed/i.test(String(err?.message ?? err))) {
      throw new CheckoutError(409, 'Ktoś właśnie kupił ostatnie sztuki jednego z produktów. Sprawdź koszyk — ilości zostały zaktualizowane.');
    }
    throw err;
  }

  const order = await db.prepare('SELECT * FROM orders WHERE access_token_hash = ?').bind(accessHash).first();
  return { order, accessToken };
}

// Status po opłaceniu (albo od razu przy pobraniu)
function nextStatus(items) {
  if (items.some((i) => i.project_status === 'czeka')) return 'akceptacja_projektu';
  if (items.some((i) => i.product_type === 'physical' || i.product_type === 'service')) return 'w_realizacji';
  return 'zrealizowane';
}

const giftCode = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = [...b].map((x) => abc[x % abc.length]).join('');
  return `PK-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
};

// Płatność potwierdzona (albo zamówienie za pobraniem): zdejmujemy towar ze stanu, wydajemy pliki i bony.
// Idempotentne — drugie wywołanie dla tego samego zamówienia nic nie robi.
export async function finalizeOrder(db, orderId, { source, note, paid = true }) {
  const claimed = await db.prepare(
    `UPDATE orders SET status = 'oplacone', reserved_until = NULL WHERE id = ? AND status = 'czeka_na_platnosc'`
  ).bind(orderId).run();
  if (claimed.meta.changes !== 1) return { finalized: false };

  const { results: items } = await db.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(orderId).all();
  const to = nextStatus(items);
  const stmts = [];
  if (paid) {
    stmts.push(db.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, 'czeka_na_platnosc', 'oplacone', ?, ?)`)
      .bind(orderId, source, note));
  }
  stmts.push(db.prepare('UPDATE orders SET status = ? WHERE id = ?').bind(to, orderId));
  stmts.push(db.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, ?, ?, ?, ?)`)
    .bind(orderId, paid ? 'oplacone' : 'czeka_na_platnosc', to, source, paid ? null : note));

  for (const it of items) {
    stmts.push(db.prepare(
      'UPDATE variants SET stock = stock - ?, reserved = MAX(0, reserved - ?) WHERE id = ? AND stock IS NOT NULL'
    ).bind(it.qty, it.qty, it.variant_id));
    if (it.product_type === 'digital') {
      stmts.push(db.prepare(
        'INSERT INTO downloads (order_item_id, token, r2_key, expires_at, max_downloads) VALUES (?, ?, ?, ?, 5)'
      ).bind(it.id, randomToken(24), `digital/${it.product_slug}.zip`, nowIso(7 * 24 * 60 * MIN)));
    }
    if (it.product_type === 'gift_card') {
      for (let n = 0; n < it.qty; n++) {
        stmts.push(db.prepare(
          'INSERT INTO gift_cards (code, order_item_id, initial_gr, balance_gr, valid_until) VALUES (?, ?, ?, ?, ?)'
        ).bind(giftCode(), it.id, it.unit_price_gr, it.unit_price_gr, nowIso(365 * 24 * 60 * MIN)));
      }
    }
  }
  await db.batch(stmts);
  return { finalized: true, status: to };
}

// Zwolnienie rezerwacji nieopłaconych zamówień po terminie.
// Pages Functions nie mają Cron, więc wołamy to „przy okazji” (kasa, webhooki); w Etapie 6 dojdzie Worker z Cron.
export async function releaseExpired(db, limit = 20) {
  const { results } = await db.prepare(
    `SELECT id FROM orders WHERE status = 'czeka_na_platnosc' AND reserved_until IS NOT NULL AND reserved_until < ? LIMIT ?`
  ).bind(nowIso(), limit).all();
  for (const { id } of results) await cancelOrder(db, id, { source: 'cron', note: 'Brak płatności w terminie — rezerwacja zwolniona.' });
  return results.length;
}

export async function cancelOrder(db, orderId, { source, note }) {
  const claimed = await db.prepare(
    `UPDATE orders SET status = 'anulowane', reserved_until = NULL WHERE id = ? AND status = 'czeka_na_platnosc'`
  ).bind(orderId).run();
  if (claimed.meta.changes !== 1) return false;
  const order = await db.prepare('SELECT coupon_code FROM orders WHERE id = ?').bind(orderId).first();
  const { results: items } = await db.prepare('SELECT variant_id, qty FROM order_items WHERE order_id = ?').bind(orderId).all();
  const stmts = items.map((it) =>
    db.prepare('UPDATE variants SET reserved = MAX(0, reserved - ?) WHERE id = ? AND stock IS NOT NULL').bind(it.qty, it.variant_id));
  if (order?.coupon_code) stmts.push(db.prepare('UPDATE coupons SET used = MAX(0, used - 1) WHERE code = ?').bind(order.coupon_code));
  stmts.push(db.prepare(`UPDATE payments SET status = 'odrzucona', updated_at = ? WHERE order_id = ? AND status = 'utworzona'`).bind(nowIso(), orderId));
  stmts.push(db.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, 'czeka_na_platnosc', 'anulowane', ?, ?)`)
    .bind(orderId, source, note));
  await db.batch(stmts);
  return true;
}

// Dostęp do zamówienia: właściciel konta albo ktoś z tokenem z linku
export async function findOrderForViewer(context, number, token) {
  const db = context.env.DB;
  const order = await db.prepare('SELECT * FROM orders WHERE number = ?').bind(String(number ?? '')).first();
  if (!order) return null;
  if (context.data.customer && order.customer_id === context.data.customer.id) return order;
  if (token && order.access_token_hash === await sha256(String(token))) return order;
  return null;
}

// Widok zamówienia dla klienta
export async function orderView(context, order) {
  const db = context.env.DB;
  const [{ results: items }, { results: events }, payment, { results: downloads }, { results: giftCards }] = await db.batch([
    db.prepare('SELECT id, name, variant_label, sku, unit_price_gr, qty, product_type, product_slug, project_status, upload_id FROM order_items WHERE order_id = ? ORDER BY id').bind(order.id),
    db.prepare('SELECT to_status, created_at, note, source FROM order_events WHERE order_id = ? ORDER BY id').bind(order.id),
    db.prepare('SELECT provider, status, amount_gr, attempt, updated_at FROM payments WHERE order_id = ? ORDER BY attempt DESC, id DESC LIMIT 1').bind(order.id),
    db.prepare(
      `SELECT d.token, d.expires_at, d.max_downloads, d.downloads, oi.name
         FROM downloads d JOIN order_items oi ON oi.id = d.order_item_id WHERE oi.order_id = ?`
    ).bind(order.id),
    db.prepare(
      `SELECT g.code, g.balance_gr, g.valid_until FROM gift_cards g JOIN order_items oi ON oi.id = g.order_item_id WHERE oi.order_id = ?`
    ).bind(order.id)
  ]);
  const paymentRow = payment.results?.[0] ?? null;
  return {
    number: order.number,
    status: order.status,
    status_label: STATUS_LABEL[order.status],
    created_at: order.created_at,
    email: order.email,
    payment_method: order.payment_method,
    payment: paymentRow,
    can_pay: order.status === 'czeka_na_platnosc' && (order.payment_method === 'stripe' || order.payment_method === 'przelewy24'),
    reserved_until: order.reserved_until,
    shipping_method: order.shipping_method,
    locker_code: order.locker_code,
    shipping: order.shipping_json ? JSON.parse(order.shipping_json) : null,
    billing: order.billing_json ? JSON.parse(order.billing_json) : null,
    totals: {
      subtotal_gr: order.subtotal_gr, discount_gr: order.discount_gr, shipping_gr: order.shipping_gr,
      total_gr: order.total_gr, vat_gr: order.vat_gr, coupon_code: order.coupon_code
    },
    items: items.map((i) => ({ ...i, line_total_gr: i.unit_price_gr * i.qty, has_file: !!i.upload_id, upload_id: undefined })),
    events: events.map((e) => ({ status: e.to_status, label: STATUS_LABEL[e.to_status], at: e.created_at, note: e.source === 'klient' ? null : e.note })),
    downloads: downloads.map((d) => ({ name: d.name, url: `/api/downloads/${d.token}`, expires_at: d.expires_at, left: d.max_downloads - d.downloads })),
    gift_cards: giftCards,
    bank_transfer: order.payment_method === 'przelew' && order.status === 'czeka_na_platnosc'
      ? {
        recipient: 'PromoKuźnia — sklep demonstracyjny',
        account: 'PL00 0000 0000 0000 0000 0000 0000',
        title: order.number,
        amount_gr: order.total_gr,
        demo: true
      } : null
  };
}
