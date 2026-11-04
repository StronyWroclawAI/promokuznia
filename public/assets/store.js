// Warstwa danych koszyka i konta. Dwa tryby z tym samym interfejsem:
//  • apiStore   — prawdziwy sklep: koszyk w D1, sesje HttpOnly, pliki w R2
//  • localStore — podgląd bez serwera: wszystko w przeglądarce, pliki tylko z nazwy
import { computeTotals, shippingOptions, paymentOptions } from './pricing.js';

async function call(method, url, body) {
  const init = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Nie udało się połączyć ze sklepem. Spróbuj ponownie.');
    err.field = data.field;
    err.status = res.status;
    throw err;
  }
  return data;
}

export const apiStore = {
  mode: 'api',
  getCart: () => call('GET', '/api/cart').then((d) => d.cart),
  addItem: (variantId, qty, uploadId) => call('POST', '/api/cart/items', { variant_id: variantId, qty, upload_id: uploadId ?? null }).then((d) => d.cart),
  updateItem: (lineId, patch) => call('PATCH', `/api/cart/items/${lineId}`, patch).then((d) => d.cart),
  removeItem: (lineId) => call('DELETE', `/api/cart/items/${lineId}`).then((d) => d.cart),
  applyCoupon: (code) => call('POST', '/api/cart/coupon', { code }).then((d) => d.cart),
  removeCoupon: () => call('DELETE', '/api/cart/coupon').then((d) => d.cart),
  upload: (file) => { const f = new FormData(); f.append('file', file); return call('POST', '/api/uploads', f).then((d) => d.upload); },
  me: () => call('GET', '/api/auth/me').then((d) => d.customer),
  login: (email, password) => call('POST', '/api/auth/login', { email, password }).then((d) => d.customer),
  register: (payload) => call('POST', '/api/auth/register', payload).then((d) => d.customer),
  logout: () => call('POST', '/api/auth/logout'),
  resetRequest: (email) => call('POST', '/api/auth/reset-request', { email }),
  reset: (token, password) => call('POST', '/api/auth/reset', { token, password }),
  orders: () => call('GET', '/api/account/orders').then((d) => d.orders),
  quote: (opts = {}) => {
    const q = new URLSearchParams(Object.entries(opts).filter(([, v]) => v));
    return call('GET', `/api/checkout?${q}`);
  },
  checkout: (payload) => call('POST', '/api/checkout', payload),
  getOrder: (number, t) => call('GET', `/api/order?${new URLSearchParams({ number, ...(t ? { t } : {}) })}`).then((d) => d.order),
  retryPay: (number, t) => call('POST', '/api/order/pay', { number, t }),
  simulation: (ref) => call('GET', `/api/payments/simulate?${new URLSearchParams({ ref })}`).then((d) => d.payment),
  simulate: (ref, outcome, t) => call('POST', '/api/payments/simulate', { ref, outcome, t })
};

// ───────────── Tryb podglądu ─────────────

export function createLocalStore(catalog, demoCoupons = []) {
  const KEY = 'promokuznia-local-v2';
  const byVariant = {};
  for (const p of catalog.products) for (const v of p.variants) byVariant[v.id] = { p, v };

  let mem = { lines: [], coupon_code: null, accounts: {}, customer: null, nextId: 1 };
  const load = () => { try { return { ...mem, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return mem; } };
  const save = (s) => { mem = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* tryb prywatny */ } };
  const fail = (message, field) => { const e = new Error(message); e.field = field; throw e; };
  const maxQty = (v) => (v.stock === null ? 99 : Math.max(0, Math.min(99, v.stock)));
  const hash = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

  function view(s) {
    const lines = s.lines.filter((l) => byVariant[l.variantId]).map((l) => {
      const { p, v } = byVariant[l.variantId];
      const max = maxQty(v);
      return {
        id: l.id, qty: l.qty, line_total_gr: v.price_gr * l.qty,
        problem: max < l.qty ? (max === 0 ? 'Produkt jest już niedostępny.' : `Dostępne tylko ${max} szt.`) : null,
        variant: { id: v.id, sku: v.sku, label: v.label, price_gr: v.price_gr, max_qty: max },
        product: { slug: p.slug, name: p.name, type: p.type, shipping_class: p.shipping_class, personalizable: p.personalizable, lead_time_days: p.lead_time_days, vat_rate: p.vat_rate, art: p.art },
        upload: l.upload ?? null
      };
    });
    const coupon = demoCoupons.find((c) => c.code === s.coupon_code) ?? null;
    return { lines, coupon_code: s.coupon_code, totals: computeTotals(lines, coupon) };
  }

  return {
    mode: 'local',
    async getCart() { return view(load()); },
    async addItem(variantId, qty, uploadId) {
      const s = load();
      const hit = byVariant[variantId] ?? fail('Ten produkt nie jest już dostępny.');
      const upload = uploadId ? s.uploads?.[uploadId] ?? null : null;
      const existing = s.lines.find((l) => l.variantId === variantId && (l.upload?.id ?? null) === (upload?.id ?? null));
      const wanted = (existing?.qty ?? 0) + qty;
      const max = maxQty(hit.v);
      if (max === 0) fail('Ten wariant jest chwilowo niedostępny.');
      if (wanted > max) fail(`Możesz zamówić najwyżej ${max} szt. tego wariantu.`);
      if (existing) existing.qty = wanted;
      else s.lines.push({ id: s.nextId++, variantId, qty, upload });
      save(s); return view(s);
    },
    async updateItem(lineId, patch) {
      const s = load();
      const line = s.lines.find((l) => l.id === lineId) ?? fail('Tej pozycji nie ma już w koszyku.');
      if ('qty' in patch) {
        const max = maxQty(byVariant[line.variantId].v);
        if (patch.qty > max) fail(`Możesz zamówić najwyżej ${max} szt. tego wariantu.`);
        line.qty = Math.max(1, patch.qty);
      }
      if ('upload_id' in patch) line.upload = patch.upload_id ? s.uploads?.[patch.upload_id] ?? null : null;
      save(s); return view(s);
    },
    async removeItem(lineId) { const s = load(); s.lines = s.lines.filter((l) => l.id !== lineId); save(s); return view(s); },
    async applyCoupon(code) {
      const c = demoCoupons.find((x) => x.code === code.trim().toUpperCase()) ?? fail('Nie znamy tego kodu albo już wygasł.');
      const s = load(); s.coupon_code = c.code; save(s); return view(s);
    },
    async removeCoupon() { const s = load(); s.coupon_code = null; save(s); return view(s); },
    async upload(file) {
      if (file.size > 20 * 1024 * 1024) fail('Plik jest za duży. Maksymalnie 20 MB.');
      if (!/\.(pdf|png|jpe?g|svg|ai|eps)$/i.test(file.name)) fail('Akceptujemy PDF, PNG, JPG, SVG, AI i EPS.');
      const s = load();
      const up = { id: `local-${Date.now()}`, filename: file.name, size: file.size, mime: file.type };
      s.uploads = { ...(s.uploads ?? {}), [up.id]: up };
      save(s); return up;
    },
    async me() { return load().customer; },
    async login(email, password) {
      const s = load();
      const acc = s.accounts[email.trim().toLowerCase()];
      if (!acc || acc.hash !== await hash(password)) fail('Nieprawidłowy e-mail lub hasło.');
      s.customer = { email: email.trim().toLowerCase(), first_name: acc.first_name }; save(s); return s.customer;
    },
    async register({ email, password, first_name }) {
      const e = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)) fail('Podaj poprawny adres e-mail.', 'email');
      if (String(password).length < 10) fail('Hasło musi mieć co najmniej 10 znaków.', 'password');
      const s = load();
      if (s.accounts[e]) fail('Konto z tym adresem już istnieje. Zaloguj się albo zresetuj hasło.', 'email');
      s.accounts[e] = { hash: await hash(password), first_name: first_name || null };
      s.customer = { email: e, first_name: first_name || null }; save(s); return s.customer;
    },
    async logout() { const s = load(); s.customer = null; save(s); },
    async resetRequest() { return { ok: true, message: 'W podglądzie maile nie wychodzą. W prawdziwym sklepie przyjdzie link ważny 60 minut.' }; },
    async reset() { fail('Reset hasła działa tylko w uruchomionym sklepie.'); },
    async orders() {
      const s = load();
      if (!s.customer) return [];
      return Object.values(s.orders ?? {}).filter((o) => o.email === s.customer.email)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((o) => ({ number: o.number, status: o.status, status_label: o.status_label, total_gr: o.totals.total_gr, created_at: o.created_at, items: o.items.length }));
    },

    // ── kasa i zamówienia w podglądzie: ta sama logika cen, płatność przez bramkę testową ──
    async quote(opts = {}) {
      const s = load();
      const cart = view(s);
      const coupon = demoCoupons.find((c) => c.code === s.coupon_code) ?? null;
      const providers = { stripe: 'symulator', przelewy24: 'symulator', przelew: 'przelew', pobranie: 'pobranie' };
      return {
        demo: true, providers, cart,
        totals: computeTotals(cart.lines, coupon, opts),
        shipping_options: shippingOptions(cart.lines),
        payment_options: paymentOptions(cart.lines, opts.shipping_method).map((p) => ({ ...p, provider: providers[p.method] }))
      };
    },
    async checkout(b) {
      const s = load();
      const cart = view(s);
      if (!cart.lines.length) fail('Koszyk jest pusty.');
      const physical = cart.lines.some((l) => l.product.type === 'physical');
      const digital = cart.lines.some((l) => l.product.type === 'digital');
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(b.email ?? '')) fail('Podaj poprawny adres e-mail.', 'email');
      if (physical && !b.shipping_method) fail('Wybierz sposób dostawy.', 'shipping_method');
      if (physical && !/^\+?[\d\s-]{9,16}$/.test(b.phone ?? '')) fail('Podaj numer telefonu — przewoźnik wyśle na niego SMS.', 'phone');
      if (physical && String(b.ship_name ?? '').trim().length < 3) fail('Podaj imię i nazwisko odbiorcy.', 'ship_name');
      if (b.shipping_method === 'paczkomat' && !/^[A-Z]{3}\d{2,3}[A-Z]{1,2}$/.test(String(b.locker_code ?? '').toUpperCase())) fail('Podaj kod Paczkomatu, np. WRO01M.', 'locker_code');
      if (b.shipping_method === 'kurier_inpost') {
        if (String(b.ship_street ?? '').trim().length < 3) fail('Podaj ulicę i numer.', 'ship_street');
        if (!/^\d{2}-\d{3}$/.test(b.ship_postcode ?? '')) fail('Kod pocztowy w formacie 00-000.', 'ship_postcode');
        if (String(b.ship_city ?? '').trim().length < 2) fail('Podaj miejscowość.', 'ship_city');
      }
      if (!b.payment_method) fail('Wybierz sposób płatności.', 'payment_method');
      if (b.payment_method === 'pobranie' && b.shipping_method !== 'kurier_inpost') fail('Tylko przy dostawie kurierem.', 'payment_method');
      if (b.terms !== true) fail('Zaakceptuj regulamin, żeby złożyć zamówienie.', 'terms');
      if (digital && b.digital_consent !== true) fail('Przy produktach cyfrowych potrzebujemy zgody na dostarczenie ich od razu.', 'digital_consent');

      const coupon = demoCoupons.find((c) => c.code === s.coupon_code) ?? null;
      const totals = computeTotals(cart.lines, coupon, { shipping_method: b.shipping_method, payment_method: b.payment_method });
      s.orderSeq = (s.orderSeq ?? 0) + 1;
      const number = `PK/${new Date().getFullYear()}/${String(s.orderSeq).padStart(6, '0')}`;
      const now = new Date().toISOString();
      const order = {
        number, status: 'czeka_na_platnosc', status_label: 'Czeka na płatność', created_at: now, email: b.email.trim().toLowerCase(),
        payment_method: b.payment_method, payment: { provider: b.payment_method === 'stripe' || b.payment_method === 'przelewy24' ? 'symulator' : b.payment_method, status: 'utworzona', amount_gr: totals.total_gr },
        can_pay: b.payment_method === 'stripe' || b.payment_method === 'przelewy24',
        shipping_method: physical ? b.shipping_method : 'brak', locker_code: b.shipping_method === 'paczkomat' ? b.locker_code.toUpperCase() : null,
        shipping: physical ? { name: b.ship_name, street: b.ship_street, postcode: b.ship_postcode, city: b.ship_city } : null,
        billing: b.invoice ? { company: b.bill_company, nip: b.bill_nip, street: b.bill_street, postcode: b.bill_postcode, city: b.bill_city } : null,
        totals: { subtotal_gr: totals.subtotal_gr, discount_gr: totals.discount_gr, shipping_gr: totals.shipping?.price_gr ?? 0, total_gr: totals.total_gr, vat_gr: totals.vat_gr, coupon_code: totals.coupon?.ok ? totals.coupon.code : null },
        items: cart.lines.map((l) => ({ name: l.product.name, variant_label: l.variant.label, sku: l.variant.sku, unit_price_gr: l.variant.price_gr, qty: l.qty, line_total_gr: l.line_total_gr, product_type: l.product.type, product_slug: l.product.slug, project_status: l.product.personalizable ? 'czeka' : null, has_file: !!l.upload })),
        events: [{ status: 'czeka_na_platnosc', label: 'Czeka na płatność', at: now, note: null }],
        downloads: [], gift_cards: [], local: true,
        bank_transfer: b.payment_method === 'przelew' ? { recipient: 'PromoKuźnia — sklep demonstracyjny', account: 'PL00 0000 0000 0000 0000 0000 0000', title: number, amount_gr: totals.total_gr, demo: true } : null
      };
      s.orders = { ...(s.orders ?? {}), [number]: order };
      s.lines = []; s.coupon_code = null;
      if (b.payment_method === 'pobranie') finalizeLocal(order, false);
      save(s);
      return { order: { number, access_token: null }, local_route: order.can_pay ? 'symulator-platnosci' : 'zamowienie' };
    },
    async getOrder(number) { return load().orders?.[number] ?? fail('Nie znaleziono zamówienia w tej przeglądarce.'); },
    async retryPay(number) {
      const s = load();
      const o = s.orders?.[number] ?? fail('Nie znaleziono zamówienia.');
      if (o.status !== 'czeka_na_platnosc') fail('To zamówienie nie czeka już na płatność.');
      o.payment.status = 'utworzona';
      save(s);
      return { order: { number }, local_route: 'symulator-platnosci' };
    },
    async simulation(number) {
      const o = load().orders?.[number] ?? fail('Ta płatność testowa nie istnieje.');
      return { number, amount_gr: o.totals.total_gr, status: o.payment.status, method: o.payment_method, email: o.email };
    },
    async simulate(number, outcome) {
      const s = load();
      const o = s.orders?.[number] ?? fail('Ta płatność testowa nie istnieje.');
      if (o.status !== 'czeka_na_platnosc') fail('Ta płatność została już rozliczona.');
      if (outcome === 'paid') finalizeLocal(o, true);
      else { o.payment.status = 'odrzucona'; o.events.push({ status: o.status, label: 'Czeka na płatność', at: new Date().toISOString(), note: 'Płatność testowa odrzucona.' }); }
      save(s);
      return { order: { number }, local_route: 'zamowienie' };
    }
  };

  function finalizeLocal(o, paid) {
    const LABEL = { oplacone: 'Opłacone', akceptacja_projektu: 'Akceptacja projektu', w_realizacji: 'W realizacji', zrealizowane: 'Zrealizowane' };
    const at = new Date().toISOString();
    const to = o.items.some((i) => i.project_status === 'czeka') ? 'akceptacja_projektu'
      : o.items.some((i) => i.product_type === 'physical' || i.product_type === 'service') ? 'w_realizacji' : 'zrealizowane';
    if (paid) { o.payment.status = 'oplacona'; o.events.push({ status: 'oplacone', label: LABEL.oplacone, at, note: 'Bramka testowa (podgląd)' }); }
    o.events.push({ status: to, label: LABEL[to], at, note: paid ? null : 'Płatność przy odbiorze — przekazane do realizacji.' });
    o.status = to; o.status_label = LABEL[to]; o.can_pay = false; o.bank_transfer = null;
    o.downloads = o.items.filter((i) => i.product_type === 'digital').map((i) => ({ name: i.name, url: null, left: 5, expires_at: new Date(Date.now() + 7 * 864e5).toISOString() }));
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    o.gift_cards = o.items.filter((i) => i.product_type === 'gift_card').flatMap((i) => Array.from({ length: i.qty }, () => ({
      code: `PK-${Array.from({ length: 12 }, () => abc[Math.floor(Math.random() * abc.length)]).join('').replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3')}`,
      balance_gr: i.unit_price_gr, valid_until: new Date(Date.now() + 365 * 864e5).toISOString()
    })));
  }
}
