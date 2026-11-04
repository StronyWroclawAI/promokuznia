// Warstwa danych koszyka i konta. Dwa tryby z tym samym interfejsem:
//  • apiStore   — prawdziwy sklep: koszyk w D1, sesje HttpOnly, pliki w R2
//  • localStore — podgląd bez serwera: wszystko w przeglądarce, pliki tylko z nazwy
import { computeTotals } from './pricing.js';

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
  orders: () => call('GET', '/api/account/orders').then((d) => d.orders)
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
        product: { slug: p.slug, name: p.name, type: p.type, shipping_class: p.shipping_class, personalizable: p.personalizable, lead_time_days: p.lead_time_days, art: p.art },
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
    async orders() { return []; }
  };
}
