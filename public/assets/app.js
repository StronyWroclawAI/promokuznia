// PromoKuźnia — front sklepu (Etapy 1–3: katalog, karta produktu, koszyk w D1, konto, pliki do personalizacji).
// Katalog: window.__CATALOG__ (podgląd) → /api/products (Pages Functions + D1) → /data/catalog.json (tryb statyczny).
// Koszyk i konto: apiStore przy działającym API, w podglądzie localStore (wszystko w przeglądarce).
import { FREE_SHIPPING_GR, SHIPPING } from './pricing.js';
import { apiStore, createLocalStore } from './store.js';

const view = document.getElementById('view');
const catNav = document.getElementById('cat-nav');
const cartCount = document.getElementById('cart-count');
const accountLink = document.getElementById('account-link');
const toastEl = document.getElementById('toast');
const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');

const state = {
  categories: [], products: [], bySlug: {}, byVariant: {}, query: '', sort: 'polecane', source: '',
  cart: null, customer: null, store: null, pendingUpload: null
};

// ───────────── Narzędzia ─────────────

const money = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const zl = (gr) => money.format(gr / 100);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, few, many) => {
  const d = n % 10, t = n % 100;
  if (n === 1) return one;
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return few;
  return many;
};

const TYPE_TAG = {
  digital: 'Do pobrania',
  service: 'Usługa',
  gift_card: 'Wysyłka e-mail'
};
function typeTag(p) {
  if (p.type === 'physical') return p.shipping_class === 'kurier' ? 'Kurier' : 'Paczkomat';
  return TYPE_TAG[p.type];
}

// ───────────── Ilustracje produktów (zastępują zdjęcia do czasu uploadu do R2) ─────────────

const TONE = { magenta: 'var(--c-m)', cyan: 'var(--c-c)', yellow: 'var(--c-y)', ink: 'var(--ink)' };
const K = 'stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"';
const S = 'var(--sheet)';
const lines = (x, y, w, n, gap = 14) =>
  Array.from({ length: n }, (_, i) => `<line x1="${x}" y1="${y + i * gap}" x2="${x + (i === n - 1 ? w * 0.6 : w)}" y2="${y + i * gap}" stroke="var(--line)" stroke-width="5" stroke-linecap="round"/>`).join('');

const SHAPES = {
  card: (t) => `
    <g transform="rotate(-9 200 150)"><rect x="92" y="98" width="200" height="124" rx="4" fill="${S}" ${K}/></g>
    <g transform="rotate(5 200 150)"><rect x="106" y="80" width="200" height="124" rx="4" fill="${S}" ${K}/>
      <rect x="107.5" y="81.5" width="62" height="121" fill="${t}"/>${lines(186, 120, 96, 3)}
      <rect x="186" y="168" width="40" height="8" fill="${t}"/></g>`,
  flyer: (t) => `
    <g transform="rotate(-7 200 150)"><rect x="118" y="46" width="132" height="190" fill="${S}" ${K}/></g>
    <g transform="rotate(4 200 150)"><rect x="150" y="40" width="132" height="190" fill="${S}" ${K}/>
      <rect x="151.5" y="41.5" width="129" height="88" fill="${t}"/>${lines(166, 150, 100, 4)}</g>`,
  letter: (t) => `
    <rect x="128" y="26" width="150" height="214" fill="${S}" ${K}/>
    <rect x="144" y="44" width="26" height="26" fill="${t}"/>${lines(144, 98, 118, 6, 16)}
    <line x1="144" y1="222" x2="262" y2="222" stroke="${t}" stroke-width="4"/>`,
  folder: (t) => `
    <g transform="rotate(-6 200 150)"><rect x="96" y="52" width="190" height="196" fill="${S}" ${K}/></g>
    <rect x="114" y="46" width="190" height="200" fill="${t}" ${K}/>
    <path d="M114 176 L304 154 L304 246 L114 246 Z" fill="${S}" ${K}/>
    <rect x="240" y="176" width="44" height="26" fill="none" ${K}/>`,
  sticker: (t) => `
    <circle cx="200" cy="150" r="88" fill="${t}" ${K}/>
    <path d="M200 150 m-38 0 l26 -30 l12 18 l14 -22 l24 34 z" fill="${S}"/>
    <path d="M262 212 Q246 222 240 238 Q262 236 274 224 Z" fill="${S}" ${K}/>`,
  mug: (t) => `
    <path d="M254 112 h12 a36 36 0 0 1 0 72 h-12" fill="none" stroke="var(--ink)" stroke-width="14" stroke-linecap="round"/>
    <path d="M254 112 h12 a36 36 0 0 1 0 72 h-12" fill="none" stroke="${S}" stroke-width="8" stroke-linecap="round"/>
    <rect x="138" y="84" width="118" height="140" rx="10" fill="${S}" ${K}/>
    <rect x="139.5" y="118" width="115" height="54" fill="${t}"/>
    <path d="M176 66 q-8 -12 0 -24 M200 66 q-8 -12 0 -24 M224 66 q-8 -12 0 -24" fill="none" stroke="var(--muted)" stroke-width="2.5" stroke-linecap="round"/>`,
  thermo: (t) => `
    <rect x="160" y="44" width="80" height="26" rx="6" fill="var(--ink)"/>
    <rect x="166" y="66" width="68" height="192" rx="12" fill="${t}" ${K}/>
    <rect x="182" y="130" width="36" height="36" rx="4" fill="none" stroke="${S}" stroke-width="3"/>`,
  pen: (t) => `
    <g transform="rotate(-28 200 150)">
      <rect x="66" y="136" width="240" height="28" rx="14" fill="${t}" ${K}/>
      <path d="M306 140 L344 150 L306 160 Z" fill="${S}" ${K}/>
      <rect x="96" y="124" width="70" height="10" rx="5" fill="${S}" ${K}/>
      <line x1="200" y1="150" x2="270" y2="150" stroke="${S}" stroke-width="3"/></g>`,
  lanyard: (t) => `
    <path d="M118 26 L188 196 M282 26 L212 196" stroke="${t}" stroke-width="18" stroke-linecap="round"/>
    <rect x="188" y="186" width="24" height="20" fill="var(--muted)"/>
    <rect x="152" y="204" width="96" height="70" rx="6" fill="${S}" ${K}/>${lines(168, 228, 64, 3)}`,
  tote: (t) => `
    <path d="M162 118 C162 40 238 40 238 118" fill="none" stroke="var(--ink)" stroke-width="7"/>
    <rect x="116" y="112" width="168" height="160" fill="${S}" ${K}/>
    <circle cx="200" cy="188" r="38" fill="${t}"/>`,
  tshirt: (t) => `
    <path d="M140 58 L172 46 Q200 70 228 46 L260 58 L304 102 L272 130 L260 118 L260 256 L140 256 L140 118 L128 130 L96 102 Z" fill="${t}" ${K}/>
    <rect x="214" y="98" width="28" height="22" fill="${S}"/>`,
  notebook: (t) => `
    <rect x="132" y="44" width="152" height="212" rx="6" fill="${t}" ${K}/>
    <rect x="133.5" y="45.5" width="16" height="209" fill="var(--ink)" opacity=".25"/>
    <rect x="172" y="96" width="84" height="44" fill="${S}"/>`,
  rollup: (t) => `
    <rect x="146" y="24" width="108" height="228" fill="${S}" ${K}/>
    <rect x="147.5" y="56" width="105" height="86" fill="${t}"/>${lines(162, 166, 76, 4)}
    <rect x="132" y="248" width="136" height="18" rx="4" fill="var(--ink)"/>`,
  wall: (t) => `
    <path d="M66 64 Q200 44 334 64 L334 236 Q200 216 66 236 Z" fill="${t}" ${K}/>
    <path d="M110 120 Q200 108 290 120" stroke="${S}" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="M140 150 Q200 142 260 150" stroke="${S}" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M90 238 l-14 24 M310 238 l14 24" ${K}/>`,
  flag: (t) => `
    <line x1="164" y1="28" x2="164" y2="262" stroke="var(--ink)" stroke-width="4"/>
    <path d="M166 34 C262 44 266 150 236 250 L166 250 Z" fill="${t}" ${K}/>
    <path d="M130 270 L198 270 M164 262 L140 280 M164 262 L188 280" ${K}/>`,
  grid: (t) => `
    <rect x="138" y="22" width="124" height="256" rx="18" fill="${S}" ${K}/>
    ${[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => `<rect x="${152 + c * 34}" y="${62 + r * 34}" width="30" height="30" fill="${(r + c) % 2 ? 'var(--line)' : t}"/>`)).join('')}
    ${lines(152, 186, 96, 3)}`,
  doc: (t) => `
    <path d="M132 26 H248 L278 56 V264 H132 Z" fill="${S}" ${K}/>
    <path d="M248 26 V56 H278" fill="none" ${K}/>
    <rect x="148" y="72" width="70" height="12" fill="${t}"/>${lines(148, 108, 112, 4)}
    <rect x="148" y="184" width="34" height="56" fill="${t}" opacity=".35"/><rect x="188" y="168" width="34" height="72" fill="${t}"/><rect x="228" y="200" width="34" height="40" fill="${t}" opacity=".6"/>`,
  book: (t) => `
    <path d="M200 70 Q150 52 86 64 V240 Q150 228 200 246 Z" fill="${S}" ${K}/>
    <path d="M200 70 Q250 52 314 64 V240 Q250 228 200 246 Z" fill="${S}" ${K}/>
    <rect x="104" y="92" width="28" height="28" fill="var(--c-c)"/><rect x="138" y="92" width="28" height="28" fill="var(--c-m)"/><rect x="104" y="126" width="28" height="28" fill="var(--c-y)"/><rect x="138" y="126" width="28" height="28" fill="var(--ink)"/>
    <circle cx="256" cy="120" r="30" fill="${t}"/>${lines(222, 184, 70, 2)}`,
  calendar: (t) => `
    <rect x="108" y="58" width="184" height="180" rx="6" fill="${S}" ${K}/>
    <rect x="109.5" y="59.5" width="181" height="36" fill="${t}"/>
    <path d="M150 46 v26 M250 46 v26" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>
    ${Array.from({ length: 20 }, (_, i) => `<rect x="${124 + (i % 5) * 32}" y="${110 + Math.floor(i / 5) * 30}" width="20" height="18" rx="2" fill="${i === 12 ? t : 'var(--line)'}"/>`).join('')}`,
  pin: (t) => `
    <path d="M60 220 L150 180 L250 214 L340 170" fill="none" stroke="var(--line)" stroke-width="10" stroke-linecap="round"/>
    <path d="M100 120 L190 150 L310 110" fill="none" stroke="var(--line)" stroke-width="6" stroke-linecap="round"/>
    <path d="M200 238 C176 200 146 174 146 136 a54 54 0 0 1 108 0 C254 174 224 200 200 238 Z" fill="${t}" ${K}/>
    <circle cx="200" cy="136" r="20" fill="${S}" ${K}/>`,
  pentool: (t) => `
    <path d="M80 240 C120 120 280 220 320 70" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="6 6"/>
    <rect x="72" y="232" width="16" height="16" fill="${S}" ${K}/><rect x="312" y="62" width="16" height="16" fill="${S}" ${K}/>
    <path d="M200 44 L246 136 L216 236 L184 236 L154 136 Z" fill="${t}" ${K}/>
    <line x1="200" y1="44" x2="200" y2="120" stroke="${S}" stroke-width="3"/>
    <circle cx="200" cy="132" r="10" fill="${S}" ${K}/>`,
  gift: (t) => `
    <g transform="rotate(-6 200 150)"><rect x="94" y="78" width="212" height="134" rx="8" fill="${S}" ${K}/>
      <rect x="182" y="79.5" width="22" height="131" fill="${t}"/><rect x="95.5" y="134" width="209" height="20" fill="${t}"/>
      <path d="M193 134 C170 104 150 118 168 134 Z M193 134 C216 104 236 118 218 134 Z" fill="${t}" ${K}/>
      <text x="290" y="200" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="16" fill="var(--muted)">PLN</text></g>`
};

function art(p, size = 'card') {
  const t = TONE[p.art?.tone] ?? TONE.magenta;
  const shape = SHAPES[p.art?.shape] ?? SHAPES.card;
  return `<svg viewBox="0 0 400 300" role="img" aria-label="${esc(p.name)} — ilustracja produktu" preserveAspectRatio="xMidYMid meet">
    <rect width="400" height="300" fill="${t}" opacity="${size === 'hero' ? 0.1 : 0.08}"/>${shape(t)}</svg>`;
}

// ───────────── Dane ─────────────

async function loadCatalog() {
  if (window.__CATALOG__) return { ...window.__CATALOG__, source: 'podgląd' };
  try {
    const [c, p] = await Promise.all([fetch('/api/categories'), fetch('/api/products?limit=100')]);
    if (c.ok && p.ok) {
      const [{ categories }, { products }] = await Promise.all([c.json(), p.json()]);
      return { categories, products, source: 'api' };
    }
  } catch { /* brak API — przechodzimy do pliku statycznego */ }
  const r = await fetch('/data/catalog.json');
  return { ...(await r.json()), source: 'statyczny' };
}

// ───────────── Koszyk i konto (przez state.store) ─────────────

function maxQty(variant) { return variant.stock === null ? 99 : Math.max(0, Math.min(99, variant.stock)); }

function setCart(cart) {
  state.cart = cart;
  const n = cart?.totals.items_count ?? 0;
  cartCount.textContent = n;
  cartCount.toggleAttribute('data-zero', n === 0);
}

function setCustomer(c) {
  state.customer = c;
  accountLink.textContent = c ? (c.first_name || 'Moje konto') : 'Zaloguj się';
}

// Wspólna obsługa akcji: blokuje przycisk, pokazuje błąd z serwera
async function run(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } catch (err) {
    toast(err.message, false);
    return undefined;
  } finally {
    if (button && button.isConnected) button.disabled = false;
  }
}

const fileSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const UPLOAD_ACCEPT = '.pdf,.png,.jpg,.jpeg,.svg,.ai,.eps';

// ───────────── Widoki ─────────────

function productCard(p) {
  const promo = p.compare_at_gr && p.compare_at_gr > p.price_from_gr;
  const multi = p.variants.length > 1;
  return `<a class="card" href="#p-${esc(p.slug)}">
    <div class="proof">${p.badges.length ? `<div class="badges">${p.badges.map((b) => `<span class="badge" data-kind="${esc(b)}">${esc(b)}</span>`).join('')}</div>` : ''}${art(p)}</div>
    <span class="card-name">${esc(p.name)}</span>
    <p class="card-short">${esc(p.short)}</p>
    <div class="card-meta">
      <span class="price">${multi ? '<span class="from">od </span>' : ''}${zl(p.price_from_gr)}${promo ? `<s>${zl(p.compare_at_gr)}</s>` : ''}</span>
      <span class="tag">${esc(typeTag(p))}</span>
    </div>
  </a>`;
}

function renderHome() {
  const best = state.products.filter((p) => p.badges.length).slice(0, 4);
  const featured = state.bySlug['wizytowki-standard'] ?? state.products[0];
  const counts = Object.fromEntries(state.categories.map((c) => [c.slug, state.products.filter((p) => p.category === c.slug)]));
  return `
  <section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Druk · gadżety · szablony · usługi</p>
      <h1 class="display">Wykuwamy markę, <em>którą widać.</em></h1>
      <p class="lead">Wizytówki, roll-upy, kubki z logo i gotowe szablony do social mediów. Wgrywasz plik albo zamawiasz projekt, akceptujesz podgląd, a my drukujemy i wysyłamy Paczkomatem.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#kategoria-druk-firmowy">Zobacz druk firmowy</a>
        <a class="btn" href="#wszystkie">Cały asortyment · ${state.products.length}</a>
      </div>
      <div class="hero-note"><span>kreda 350 g/m²</span><span>4+4 CMYK</span><span>wysyłka w 3 dni robocze</span></div>
    </div>
    <a class="hero-sheet" href="#p-${esc(featured.slug)}" aria-label="${esc(featured.name)}">
      <div class="proof">${art(featured, 'hero')}</div>
    </a>
  </section>

  <section class="section" aria-labelledby="h-cats">
    <div class="section-head"><h2 class="h2" id="h-cats">Kategorie</h2></div>
    <div class="cat-grid">
      ${state.categories.map((c) => {
        const list = counts[c.slug];
        const from = Math.min(...list.map((p) => p.price_from_gr));
        return `<a class="cat-tile" href="#kategoria-${esc(c.slug)}">
          <div class="thumb">${list[0] ? art(list[0]) : ''}</div>
          <div><span class="h3">${esc(c.name)}</span><p>${esc(c.lead)}</p>
          <span class="mono">${list.length} ${plural(list.length, 'produkt', 'produkty', 'produktów')} · od ${zl(from)}</span></div>
        </a>`;
      }).join('')}
    </div>
  </section>

  <section class="section" aria-labelledby="h-best">
    <div class="section-head"><h2 class="h2" id="h-best">Najczęściej wybierane</h2><a href="#wszystkie">Wszystkie produkty</a></div>
    <div class="grid">${best.map(productCard).join('')}</div>
  </section>

  <section class="section" aria-labelledby="h-how">
    <div class="section-head"><h2 class="h2" id="h-how">Jak powstaje zamówienie</h2></div>
    <ol class="steps">
      <li><span class="h3">Wybierasz produkt</span><p>Nakład, papier, kolor lub rozmiar. Cena przelicza się od razu.</p></li>
      <li><span class="h3">Wgrywasz projekt</span><p>Twój PDF, logo do nadruku albo zamówiony u nas projekt.</p></li>
      <li><span class="h3">Akceptujesz podgląd</span><p>Przy produktach z logo dostajesz mailem proof do zatwierdzenia.</p></li>
      <li><span class="h3">Drukujemy i wysyłamy</span><p>Paczkomat, kurier albo link do pobrania przy produktach cyfrowych.</p></li>
    </ol>
  </section>

  <section class="section" aria-label="Dostawa i płatności">
    <div class="facts">
      <div class="fact"><span class="h3">Dostawa od ${zl(SHIPPING.paczkomat.price_gr)}</span><p>Paczkomat InPost lub kurier. Od ${zl(FREE_SHIPPING_GR)} wysyłka gratis.</p></div>
      <div class="fact"><span class="h3">Cyfrowe od ręki</span><p>Szablony i karty podarunkowe przychodzą mailem zaraz po płatności.</p></div>
      <div class="fact"><span class="h3">BLIK, karta, Przelewy24</span><p>W wersji demonstracyjnej płacisz testowym kodem, bez prawdziwych pieniędzy.</p></div>
    </div>
  </section>`;
}

function sortProducts(list) {
  const out = [...list];
  if (state.sort === 'cena-rosnaco') out.sort((a, b) => a.price_from_gr - b.price_from_gr);
  if (state.sort === 'cena-malejaco') out.sort((a, b) => b.price_from_gr - a.price_from_gr);
  if (state.sort === 'nazwa') out.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return out;
}

function listing({ title, lead, crumbs, products }) {
  const sorted = sortProducts(products);
  return `
  <div class="page-head">
    <div class="crumbs"><a href="#start">Start</a><span>/</span>${crumbs}</div>
    <h1 class="h2">${esc(title)}</h1>
    ${lead ? `<p class="lead">${esc(lead)}</p>` : ''}
  </div>
  <div class="toolbar">
    <span class="muted mono">${sorted.length} ${plural(sorted.length, 'produkt', 'produkty', 'produktów')}</span>
    <label>Sortuj
      <select id="sort-select">
        <option value="polecane">polecane</option>
        <option value="cena-rosnaco">cena: od najniższej</option>
        <option value="cena-malejaco">cena: od najwyższej</option>
        <option value="nazwa">nazwa A–Z</option>
      </select>
    </label>
  </div>
  ${sorted.length ? `<div class="grid">${sorted.map(productCard).join('')}</div>`
    : `<div class="empty"><p class="h3">Nic nie pasuje do „${esc(state.query)}”.</p><p class="muted">Spróbuj krótszego słowa, np. „kubek” albo „roll”.</p><a class="btn" href="#wszystkie">Pokaż wszystkie produkty</a></div>`}`;
}

function stockInfo(p, v) {
  if (p.type === 'digital') return { level: 'ok', text: 'Dostępny od ręki — link do pobrania po płatności' };
  if (p.type === 'service') return { level: 'ok', text: `Realizacja w ${p.lead_time_days} dni roboczych` };
  if (p.type === 'gift_card') return { level: 'ok', text: 'Kod wysyłamy mailem zaraz po płatności' };
  if (v.stock === null) return { level: 'ok', text: 'Dostępny' };
  if (v.stock <= 0) return { level: 'none', text: 'Chwilowo niedostępny' };
  if (v.stock < 10) return { level: 'low', text: `Ostatnie ${v.stock} szt. w magazynie` };
  return { level: 'ok', text: v.stock >= 999 ? 'Produkowane na zamówienie' : 'W magazynie' };
}

const ICON = {
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="1.8" fill="currentColor"/><circle cx="17.5" cy="17.5" r="1.8" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4h14v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5.5" width="18" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
};

function deliveryInfo(p) {
  const rows = [];
  if (p.type === 'physical') {
    const ship = p.shipping_class === 'kurier'
      ? `Tylko kurier InPost — ${zl(SHIPPING.kurier.price_gr)}. Za duży gabaryt na Paczkomat.`
      : `Paczkomat InPost ${zl(SHIPPING.paczkomat.price_gr)} (gabaryt ${esc(p.parcel_size)}) lub kurier ${zl(SHIPPING.kurier.price_gr)}.`;
    rows.push(['truck', `${ship} Gratis od ${zl(FREE_SHIPPING_GR)}.`]);
    rows.push(['clock', `Wysyłka w ${p.lead_time_days} ${plural(p.lead_time_days, 'dzień roboczy', 'dni robocze', 'dni roboczych')} od akceptacji projektu.`]);
  } else {
    rows.push(['mail', p.type === 'service' ? 'Bez wysyłki — pliki i raport dostajesz mailem.' : 'Bez wysyłki — dostajesz e-mail z linkiem lub kodem.']);
  }
  if (p.personalizable) rows.push(['upload', 'Plik z logo lub projekt wgrasz w koszyku. Przed drukiem wyślemy podgląd do akceptacji.']);
  rows.push(['back', p.personalizable
    ? 'Produkt wykonany według Twojego projektu — bez prawa odstąpienia, ale z pełną reklamacją.'
    : p.type === 'physical' ? '14 dni na odstąpienie od umowy.'
    : 'Rozpoczęcie dostarczenia treści cyfrowej za Twoją zgodą wyłącza prawo odstąpienia.']);
  return `<div class="info-list">${rows.map(([i, t]) => `<div>${ICON[i]}<span>${t}</span></div>`).join('')}</div>`;
}

function renderProduct(p) {
  const cat = state.categories.find((c) => c.slug === p.category);
  const firstAvailable = p.variants.find((v) => v.available) ?? p.variants[0];
  const related = state.products.filter((x) => x.category === p.category && x.slug !== p.slug).slice(0, 4);
  const showVariants = p.variants.length > 1;
  return `
  <div class="crumbs" style="margin-bottom: var(--s-5)"><a href="#start">Start</a><span>/</span><a href="#kategoria-${esc(cat.slug)}">${esc(cat.name)}</a><span>/</span><span>${esc(p.name)}</span></div>
  <article class="pdp">
    <div class="pdp-media">
      <div class="proof">${p.badges.length ? `<div class="badges">${p.badges.map((b) => `<span class="badge" data-kind="${esc(b)}">${esc(b)}</span>`).join('')}</div>` : ''}${art(p, 'hero')}</div>
      <p class="caption">Ilustracja poglądowa · zdjęcia produktów dojdą z R2 w Etapie 3</p>
    </div>
    <form class="pdp-buy" id="buy-form" novalidate>
      <div style="display:grid;gap:var(--s-3)">
        <h1>${esc(p.name)}</h1>
        <p class="lead" style="font-size:16px">${esc(p.short)}</p>
      </div>
      <div class="pdp-price">
        <span class="price" id="pdp-price"></span>
        <p class="small" id="pdp-omnibus" ${p.lowest_30d_gr ? '' : 'hidden'}>Najniższa cena z 30 dni przed obniżką: ${p.lowest_30d_gr ? zl(p.lowest_30d_gr) : ''}</p>
        <p class="small">${p.vat_rate === null ? 'Bon różnego przeznaczenia — VAT naliczamy przy jego wykorzystaniu.' : `Cena brutto, zawiera ${p.vat_rate}% VAT.`}</p>
      </div>
      ${showVariants ? `<fieldset>
        <legend>${p.type === 'gift_card' ? 'Wartość' : p.slug === 'koszulka-z-logo' ? 'Rozmiar' : p.variants[0].label.includes('szt') || p.variants[0].label.includes('ark') ? 'Nakład' : 'Wariant'}</legend>
        <div class="options">${p.variants.map((v) => `<label class="opt">
          <input type="radio" name="variant" id="v-${v.id}" value="${v.id}" ${v.id === firstAvailable.id ? 'checked' : ''} ${v.available ? '' : 'disabled'}>
          <span>${esc(v.label)}<small>${v.available ? zl(v.price_gr) : 'brak'}</small></span></label>`).join('')}</div>
      </fieldset>` : `<input type="hidden" name="variant" value="${firstAvailable.id}">`}
      ${p.personalizable ? `<div class="field">
        <label for="pdp-file">Plik z logo lub projektem <span class="muted">(opcjonalnie)</span></label>
        <input id="pdp-file" type="file" accept="${UPLOAD_ACCEPT}" aria-describedby="pdp-file-status">
        <small class="muted" id="pdp-file-status">PDF, PNG, JPG, SVG, AI lub EPS do 20 MB. Możesz go też dodać później w koszyku.</small>
      </div>` : ''}
      <span class="stock" id="pdp-stock"></span>
      <div class="buy-row">
        <div class="qty">
          <button type="button" data-step="-1" aria-label="Mniej">−</button>
          <label class="sr-only" for="qty-input">Ilość</label>
          <input id="qty-input" name="qty" type="number" inputmode="numeric" min="1" max="99" value="1">
          <button type="button" data-step="1" aria-label="Więcej">+</button>
        </div>
        <button class="btn btn-primary" type="submit" id="add-btn">Dodaj do koszyka</button>
      </div>
      ${deliveryInfo(p)}
    </form>
  </article>

  <section class="pdp-details">
    <div>
      <h2 class="h3" style="margin-bottom:var(--s-3)">Opis</h2>
      <p>${esc(p.description)}</p>
    </div>
    <div>
      <h2 class="h3" style="margin-bottom:var(--s-3)">Specyfikacja</h2>
      <table class="spec"><tbody>
        ${p.specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}
        <tr><th scope="row">SKU</th><td id="pdp-sku"></td></tr>
        ${p.weight_g ? `<tr><th scope="row">Waga przesyłki</th><td>${(p.weight_g / 1000).toLocaleString('pl-PL')} kg</td></tr>` : ''}
      </tbody></table>
      ${p.gpsr ? `<p class="gpsr">Producent (GPSR): ${esc(p.gpsr.name)}, ${esc(p.gpsr.address)}, ${esc(p.gpsr.contact)}</p>` : ''}
    </div>
  </section>

  ${related.length ? `<section class="section" aria-labelledby="h-rel">
    <div class="section-head"><h2 class="h2" id="h-rel">Z tej samej kategorii</h2><a href="#kategoria-${esc(cat.slug)}">${esc(cat.name)}</a></div>
    <div class="grid">${related.map(productCard).join('')}</div>
  </section>` : ''}`;
}

function bindProduct(p) {
  const form = document.getElementById('buy-form');
  const qty = document.getElementById('qty-input');
  const priceEl = document.getElementById('pdp-price');
  const stockEl = document.getElementById('pdp-stock');
  const skuEl = document.getElementById('pdp-sku');
  const addBtn = document.getElementById('add-btn');

  const selected = () => {
    const id = Number(new FormData(form).get('variant'));
    return p.variants.find((v) => v.id === id);
  };
  const sync = () => {
    const v = selected();
    const max = maxQty(v);
    qty.max = String(Math.max(1, max));
    if (Number(qty.value) > max) qty.value = String(Math.max(1, max));
    const n = Math.max(1, Number(qty.value) || 1);
    const promo = p.compare_at_gr && p.compare_at_gr > v.price_gr;
    priceEl.innerHTML = `${zl(v.price_gr * n)}${promo ? `<s>${zl(p.compare_at_gr * n)}</s>` : ''}`;
    const s = stockInfo(p, v);
    stockEl.textContent = s.text;
    stockEl.dataset.level = s.level;
    skuEl.textContent = v.sku;
    addBtn.disabled = !v.available;
    addBtn.textContent = v.available ? `Dodaj do koszyka · ${zl(v.price_gr * n)}` : 'Niedostępny';
  };
  form.addEventListener('change', sync);
  qty.addEventListener('input', sync);
  form.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const v = selected();
    qty.value = String(Math.min(Math.max(1, maxQty(v)), Math.max(1, (Number(qty.value) || 1) + Number(b.dataset.step))));
    sync();
  }));
  state.pendingUpload = null;
  const fileInput = document.getElementById('pdp-file');
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    const status = document.getElementById('pdp-file-status');
    state.pendingUpload = null;
    if (!file) return;
    status.textContent = `Wgrywam ${file.name}…`;
    run(addBtn, async () => {
      try {
        state.pendingUpload = await state.store.upload(file);
        status.textContent = `Gotowe: ${state.pendingUpload.filename} (${fileSize(state.pendingUpload.size)}). Dołączymy go do tej pozycji.`;
      } catch (err) {
        fileInput.value = '';
        status.textContent = err.message;
        throw err;
      }
    }).then(sync);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = selected();
    if (!v.available) return;
    run(addBtn, async () => {
      setCart(await state.store.addItem(v.id, Math.max(1, Number(qty.value) || 1), state.pendingUpload?.id));
      toast(`Dodano: ${p.name}${p.variants.length > 1 ? `, ${v.label}` : ''}${state.pendingUpload ? ' z plikiem' : ''}`);
      if (fileInput) { fileInput.value = ''; state.pendingUpload = null; document.getElementById('pdp-file-status').textContent = 'Dodano. Kolejną sztukę z innym plikiem możesz dodać osobno.'; }
    }).then(sync);
  });
  sync();
}

function renderCart() {
  const head = `<div class="page-head"><div class="crumbs"><a href="#start">Start</a><span>/</span><span>Koszyk</span></div><h1 class="h2">Koszyk</h1></div>`;
  const cart = state.cart;
  if (!cart?.lines.length) {
    return `${head}<div class="empty"><p class="h3">Koszyk jest pusty.</p><p class="muted">Zacznij od najczęściej wybieranych wizytówek albo przejrzyj cały asortyment.</p>
      <div class="hero-actions"><a class="btn btn-primary" href="#p-wizytowki-standard">Wizytówki Standard</a><a class="btn" href="#wszystkie">Cały asortyment</a></div></div>`;
  }
  const t = cart.totals;
  const blocked = cart.lines.some((l) => l.problem);
  const needsFile = cart.lines.filter((l) => l.product.personalizable && !l.upload).length;
  return `${head}
  <div class="cart">
    <div class="cart-items">
      ${cart.lines.map((l) => `<div class="cart-item" data-line="${l.id}">
        <a href="#p-${esc(l.product.slug)}" class="proof" tabindex="-1" aria-hidden="true">${art(l.product)}</a>
        <div>
          <h3><a href="#p-${esc(l.product.slug)}">${esc(l.product.name)}</a></h3>
          <p class="small">${esc(l.variant.label)} · <span class="mono">${esc(l.variant.sku)}</span> · ${zl(l.variant.price_gr)} / szt.</p>
          ${l.problem ? `<p class="line-problem">${esc(l.problem)}</p>` : ''}
          ${l.product.personalizable ? (l.upload
            ? `<p class="file-chip"><span class="mono">${esc(l.upload.filename)}</span> <span class="muted">${fileSize(l.upload.size)}</span>
                <button type="button" class="link-btn" data-file-detach>Odłącz plik</button></p>`
            : `<label class="file-add"><input type="file" accept="${UPLOAD_ACCEPT}" data-file-attach><span>Dodaj plik z logo lub projektem</span></label>`) : ''}
          <div class="controls">
            <div class="qty">
              <button type="button" data-cart-step="-1" aria-label="Mniej: ${esc(l.product.name)}" ${l.qty <= 1 ? 'disabled' : ''}>−</button>
              <input type="number" min="1" max="${Math.max(1, l.variant.max_qty)}" value="${l.qty}" aria-label="Ilość: ${esc(l.product.name)}" data-cart-qty>
              <button type="button" data-cart-step="1" aria-label="Więcej: ${esc(l.product.name)}" ${l.qty >= l.variant.max_qty ? 'disabled' : ''}>+</button>
            </div>
            <button type="button" class="link-btn" data-cart-remove>Usuń</button>
          </div>
        </div>
        <span class="price line-total">${zl(l.line_total_gr)}</span>
      </div>`).join('')}
    </div>
    <aside class="summary" aria-label="Podsumowanie">
      <dl>
        <dt>Produkty</dt><dd>${zl(t.subtotal_gr)}</dd>
        ${t.discount_gr ? `<dt>Rabat ${esc(t.coupon.code)}</dt><dd>−${zl(t.discount_gr)}</dd>` : ''}
        <dt>Dostawa</dt><dd>${t.shipping ? (t.shipping.price_gr ? `od ${zl(t.shipping.price_gr)}` : 'gratis') : 'bez wysyłki'}</dd>
        <dt class="total">Razem</dt><dd class="total">${zl(t.total_gr)}</dd>
      </dl>
      ${t.shipping ? (t.missing_for_free_shipping_gr ? `<p class="small">Brakuje ${zl(t.missing_for_free_shipping_gr)} do darmowej dostawy.</p><div class="progress" aria-hidden="true"><i style="width:${Math.min(100, ((FREE_SHIPPING_GR - t.missing_for_free_shipping_gr) / FREE_SHIPPING_GR) * 100)}%"></i></div>`
        : '<p class="small">Masz darmową dostawę.</p>') : ''}
      ${t.shipping?.courier_only ? '<p class="small">W koszyku jest produkt wysyłany tylko kurierem.</p>' : ''}
      <form class="coupon" id="coupon-form">
        ${cart.coupon_code
          ? `<p class="small coupon-on" data-ok="${t.coupon?.ok ? '1' : '0'}"><span class="mono">${esc(cart.coupon_code)}</span> — ${esc(t.coupon?.message ?? '')} <button type="button" class="link-btn" id="coupon-remove">Usuń kod</button></p>`
          : `<label for="coupon-input" class="small">Kod rabatowy</label>
             <div class="coupon-row"><input id="coupon-input" name="code" autocomplete="off" placeholder="np. START10"><button class="btn" type="submit">Użyj</button></div>`}
      </form>
      ${needsFile ? `<p class="small">${needsFile === 1 ? 'Jeden produkt czeka' : `${needsFile} produkty czekają`} na plik z logo. Możesz go też dosłać po złożeniu zamówienia.</p>` : ''}
      ${blocked ? '<button class="btn btn-primary" type="button" disabled>Przejdź do kasy</button><p class="small">Popraw ilości oznaczone na czerwono.</p>'
        : '<a class="btn btn-primary" href="#kasa">Przejdź do kasy</a><p class="small">Dostawę i płatność wybierzesz w następnym kroku.</p>'}
    </aside>
  </div>`;
}

function bindCart() {
  const store = state.store;
  view.querySelectorAll('.cart-item').forEach((row) => {
    const id = Number(row.dataset.line);
    const line = state.cart.lines.find((l) => l.id === id);
    const change = (fn) => run(null, async () => { setCart(await fn()); render(); });
    row.querySelector('[data-cart-qty]').addEventListener('change', (e) => change(() => store.updateItem(id, { qty: Math.max(1, Number(e.target.value) || 1) })));
    row.querySelectorAll('[data-cart-step]').forEach((b) => b.addEventListener('click', () =>
      change(() => store.updateItem(id, { qty: Math.max(1, line.qty + Number(b.dataset.cartStep)) }))));
    row.querySelector('[data-cart-remove]').addEventListener('click', () =>
      change(async () => { const c = await store.removeItem(id); toast('Usunięto produkt z koszyka.', false); return c; }));
    row.querySelector('[data-file-detach]')?.addEventListener('click', () => change(() => store.updateItem(id, { upload_id: null })));
    row.querySelector('[data-file-attach]')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      change(async () => {
        toast(`Wgrywam ${file.name}…`, false);
        const up = await store.upload(file);
        const c = await store.updateItem(id, { upload_id: up.id });
        toast(`Dołączono plik ${up.filename}.`, false);
        return c;
      });
    });
  });
  const form = document.getElementById('coupon-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = new FormData(form).get('code');
    run(form.querySelector('button'), async () => { setCart(await store.applyCoupon(String(code))); render(); });
  });
  document.getElementById('coupon-remove')?.addEventListener('click', (e) =>
    run(e.currentTarget, async () => { setCart(await store.removeCoupon()); render(); }));
}

// ───────────── Konto ─────────────

function accountHead(title) {
  return `<div class="page-head"><div class="crumbs"><a href="#start">Start</a><span>/</span><span>${esc(title)}</span></div><h1 class="h2">${esc(title)}</h1></div>`;
}
const localNote = () => (state.store.mode === 'local'
  ? '<p class="note">Podgląd bez serwera: konto zapisuje się tylko w tej przeglądarce. W uruchomionym sklepie dane trafiają do bazy D1, a sesja do ciasteczka HttpOnly.</p>' : '');

function renderAccount() {
  if (!state.customer) {
    return `${accountHead('Konto')}${localNote()}
    <div class="auth-grid">
      <form class="panel" id="login-form" novalidate>
        <h2 class="h3">Mam konto</h2>
        <div class="field"><label for="login-email">E-mail</label><input id="login-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="login-password">Hasło</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary" type="submit">Zaloguj się</button>
        <a href="#reset-hasla" class="small">Nie pamiętasz hasła?</a>
      </form>
      <form class="panel" id="register-form" novalidate>
        <h2 class="h3">Zakładam konto</h2>
        <p class="small">Konto nie jest potrzebne do zakupów. Daje historię zamówień, zapisany koszyk i szybszą kasę.</p>
        <div class="field"><label for="reg-name">Imię <span class="muted">(opcjonalnie)</span></label><input id="reg-name" name="first_name" autocomplete="given-name"></div>
        <div class="field"><label for="reg-email">E-mail</label><input id="reg-email" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="reg-password">Hasło</label><input id="reg-password" name="password" type="password" autocomplete="new-password" minlength="10" required aria-describedby="reg-pw-hint"><small id="reg-pw-hint" class="muted">Co najmniej 10 znaków.</small></div>
        <label class="check"><input type="checkbox" name="marketing_consent" id="reg-consent"><span>Chcę dostawać e-mailem informacje o nowościach i promocjach PromoKuźni. Zgodę mogę wycofać w każdej chwili.</span></label>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn" type="submit">Załóż konto</button>
      </form>
    </div>`;
  }
  const c = state.customer;
  return `${accountHead('Moje konto')}${localNote()}
  <div class="account">
    <section class="panel">
      <p class="eyebrow">Zalogowano jako</p>
      <p class="h3">${esc(c.first_name ?? c.email)}</p>
      <p class="small mono">${esc(c.email)}</p>
      ${c.is_admin ? '<a class="btn btn-primary" href="/admin/">Panel sklepu</a>' : ''}
      <button class="btn" type="button" id="logout-btn">Wyloguj się</button>
    </section>
    <section>
      <h2 class="h3" style="margin-bottom:var(--s-3)">Zamówienia</h2>
      <div id="orders"><p class="muted">Wczytuję…</p></div>
    </section>
  </div>`;
}

const STATUS_PL = {
  czeka_na_platnosc: 'Czeka na płatność', oplacone: 'Opłacone', akceptacja_projektu: 'Akceptacja projektu',
  w_realizacji: 'W realizacji', wyslane: 'Wysłane', dostarczone: 'Dostarczone', zrealizowane: 'Zrealizowane',
  anulowane: 'Anulowane', zwrocone: 'Zwrócone'
};

function formError(form, err) {
  const box = form.querySelector('.form-error');
  box.textContent = err.message;
  box.hidden = false;
  form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  if (err.field) form.querySelector(`[name="${err.field}"]`)?.setAttribute('aria-invalid', 'true');
}

async function submitForm(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  form.querySelector('.form-error')?.setAttribute('hidden', '');
  try { await fn(Object.fromEntries(new FormData(form))); }
  catch (err) { formError(form, err); }
  finally { if (btn.isConnected) btn.disabled = false; }
}

async function afterAuth(customer, message) {
  // /api/auth/me zwraca też uprawnienia (np. dostęp do panelu)
  setCustomer((await state.store.me().catch(() => null)) ?? customer);
  setCart(await state.store.getCart());
  toast(message, false);
  render();
}

function bindAccount() {
  const store = state.store;
  const login = document.getElementById('login-form');
  login?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(login, async (d) => afterAuth(await store.login(d.email, d.password), 'Zalogowano. Koszyk z tej przeglądarki jest teraz na Twoim koncie.'));
  });
  const reg = document.getElementById('register-form');
  reg?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(reg, async (d) => afterAuth(
      await store.register({ email: d.email, password: d.password, first_name: d.first_name, marketing_consent: d.marketing_consent === 'on' }),
      'Konto założone. Witamy w PromoKuźni.'));
  });
  document.getElementById('logout-btn')?.addEventListener('click', (e) => run(e.currentTarget, async () => {
    await store.logout();
    setCustomer(null);
    setCart(await store.getCart());
    toast('Wylogowano.', false);
    render();
  }));
  const orders = document.getElementById('orders');
  if (orders) {
    store.orders().then((list) => {
      orders.innerHTML = list.length
        ? `<table class="spec"><thead><tr><th>Numer</th><th>Data</th><th>Status</th><th>Kwota</th></tr></thead><tbody>${list.map((o) =>
          `<tr><td><a href="#zamowienie" data-order="${esc(o.number)}">${esc(o.number)}</a></td><td>${new Date(o.created_at).toLocaleDateString('pl-PL')}</td><td><span class="status-pill" data-status="${esc(o.status)}">${esc(STATUS_PL[o.status] ?? o.status)}</span></td><td>${zl(o.total_gr)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty" style="padding:0"><p class="muted">Nie masz jeszcze zamówień.</p><a class="btn" href="#wszystkie">Przejrzyj asortyment</a></div>';
      orders.querySelectorAll('[data-order]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); openOrder(a.dataset.order, null); }));
    }).catch((err) => { orders.innerHTML = `<p class="muted">${esc(err.message)}</p>`; });
  }
}

function renderResetRequest() {
  return `${accountHead('Reset hasła')}
  <form class="panel narrow" id="reset-request-form" novalidate>
    <p>Podaj e-mail konta. Wyślemy link do ustawienia nowego hasła, ważny 60 minut.</p>
    <div class="field"><label for="reset-email">E-mail</label><input id="reset-email" name="email" type="email" autocomplete="email" required></div>
    <p class="form-error" role="alert" hidden></p>
    <div id="reset-result" role="status"></div>
    <button class="btn btn-primary" type="submit">Wyślij link</button>
    <a class="small" href="#konto">Wróć do logowania</a>
  </form>`;
}
function bindResetRequest() {
  const form = document.getElementById('reset-request-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(form, async (d) => {
      const r = await state.store.resetRequest(d.email);
      document.getElementById('reset-result').innerHTML = `<p class="note">${esc(r.message)}</p>${r.dev_link
        ? `<p class="small">Tryb deweloperski (mail wyślemy w Etapie 6): <a href="${esc(r.dev_link)}">otwórz link resetu</a></p>` : ''}`;
    });
  });
}

const resetToken = () => new URLSearchParams(location.search).get('reset');
function renderNewPassword() {
  if (!resetToken()) {
    return `${accountHead('Nowe hasło')}<div class="empty"><p class="muted">Ten adres działa tylko z linku z maila.</p><a class="btn" href="#reset-hasla">Poproś o nowy link</a></div>`;
  }
  return `${accountHead('Nowe hasło')}
  <form class="panel narrow" id="new-password-form" novalidate>
    <div class="field"><label for="np-1">Nowe hasło</label><input id="np-1" name="password" type="password" autocomplete="new-password" minlength="10" required><small class="muted">Co najmniej 10 znaków.</small></div>
    <div class="field"><label for="np-2">Powtórz hasło</label><input id="np-2" name="password2" type="password" autocomplete="new-password" required></div>
    <p class="form-error" role="alert" hidden></p>
    <button class="btn btn-primary" type="submit">Ustaw hasło i zaloguj</button>
  </form>`;
}
function bindNewPassword() {
  const form = document.getElementById('new-password-form');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(form, async (d) => {
      if (d.password !== d.password2) { const err = new Error('Hasła się różnią.'); err.field = 'password2'; throw err; }
      await state.store.reset(resetToken(), d.password);
      history.replaceState(null, '', `${location.pathname}#konto`);
      await afterAuth(await state.store.me(), 'Hasło zmienione. Jesteś zalogowany.');
    });
  });
}

// ───────────── Kasa ─────────────

const urlParam = (k) => new URLSearchParams(location.search).get(k);

// Po złożeniu zamówienia / płatności: w sklepie przekierowanie z serwera, w podglądzie zmiana widoku
function follow(result) {
  if (result.local_route) {
    state.orderRef = result.order.number;
    location.hash = result.local_route;
    if (location.hash === `#${result.local_route}`) onRoute();
    return;
  }
  location.assign(result.redirect_url);
}

function openOrder(number, token) {
  if (state.store.mode === 'local') { state.orderRef = number; location.hash = 'zamowienie'; onRoute(); return; }
  const q = new URLSearchParams({ zamowienie: number });
  if (token) q.set('t', token);
  location.assign(`/?${q}#zamowienie`);
}

function renderCheckout() {
  return `<div class="page-head"><div class="crumbs"><a href="#start">Start</a><span>/</span><a href="#koszyk">Koszyk</a><span>/</span><span>Kasa</span></div><h1 class="h2">Kasa</h1></div>
  <div id="checkout"><p class="muted">Przygotowuję podsumowanie…</p></div>`;
}

const field = (id, label, attrs = '', hint = '') =>
  `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id.replace(/^co-/, '')}" ${attrs}>${hint ? `<small class="muted">${hint}</small>` : ''}</div>`;

function checkoutSummary(q) {
  const t = q.totals;
  return `<p class="eyebrow">Twoje zamówienie</p>
    <ul class="co-lines">${q.cart.lines.map((l) => `<li><span>${esc(l.product.name)} <span class="muted">· ${esc(l.variant.label)} × ${l.qty}</span></span><span class="mono">${zl(l.line_total_gr)}</span></li>`).join('')}</ul>
    <dl>
      <dt>Produkty</dt><dd>${zl(t.subtotal_gr)}</dd>
      ${t.discount_gr ? `<dt>Rabat ${esc(t.coupon.code)}</dt><dd>−${zl(t.discount_gr)}</dd>` : ''}
      ${t.shipping ? `<dt>${esc(t.shipping.label)}</dt><dd>${t.shipping.base_gr ? zl(t.shipping.base_gr) : 'gratis'}</dd>` : ''}
      ${t.shipping?.cod_fee_gr ? `<dt>Opłata za pobranie</dt><dd>${zl(t.shipping.cod_fee_gr)}</dd>` : ''}
      <dt class="total">Do zapłaty</dt><dd class="total">${zl(t.total_gr)}</dd>
    </dl>
    <p class="small">W tym VAT ${zl(t.vat_gr)}.</p>`;
}

async function bindCheckout() {
  const box = document.getElementById('checkout');
  const store = state.store;
  let q;
  try { q = await store.quote(); } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; return; }
  if (!q.cart.lines.length) {
    box.innerHTML = '<div class="empty"><p class="h3">Koszyk jest pusty.</p><a class="btn btn-primary" href="#wszystkie">Wróć do zakupów</a></div>';
    return;
  }
  if (q.cart.lines.some((l) => l.problem)) { location.hash = 'koszyk'; return; }

  const physical = q.cart.lines.some((l) => l.product.type === 'physical');
  const digital = q.cart.lines.some((l) => l.product.type === 'digital');
  const shipOpts = q.shipping_options;
  const firstShip = shipOpts.find((o) => o.available && o.method !== 'odbior');
  const c = state.customer;
  const free = q.totals.missing_for_free_shipping_gr === 0 && q.totals.shipping && q.totals.shipping.base_gr === 0;

  box.innerHTML = `<form class="checkout" id="checkout-form" novalidate>
    <div class="co-main">
      ${q.demo ? `<p class="note">Sklep demonstracyjny${store.mode === 'local' ? ' w podglądzie' : ''}: płatność online przejdzie przez bramkę testową i nie pobierze pieniędzy.</p>` : ''}
      <section class="co-step">
        <h2 class="h3"><span class="step-no">1</span>Kontakt</h2>
        ${!c ? '<p class="small">Masz konto? <a href="#konto">Zaloguj się</a>, żeby zamówienie trafiło do historii. Możesz też kupić bez konta.</p>' : ''}
        <div class="co-grid">
          ${field('co-email', 'E-mail', `type="email" autocomplete="email" required value="${esc(c?.email ?? '')}"`, 'Wyślemy tu potwierdzenie i link do zamówienia.')}
          ${field('co-phone', `Telefon${physical ? '' : ' <span class="muted">(opcjonalnie)</span>'}`, 'type="tel" autocomplete="tel" inputmode="tel" placeholder="600 100 200"', physical ? 'Na ten numer przyjdzie SMS od przewoźnika.' : '')}
        </div>
      </section>

      ${physical ? `<section class="co-step">
        <h2 class="h3"><span class="step-no">2</span>Dostawa</h2>
        <fieldset class="choice-list" id="ship-choices"><legend class="sr-only">Sposób dostawy</legend>
          ${shipOpts.map((o) => `<label class="choice${o.available ? '' : ' is-off'}">
            <input type="radio" name="shipping_method" value="${o.method}" ${o === firstShip ? 'checked' : ''} ${o.available ? '' : 'disabled'}>
            <span class="choice-body"><span class="choice-title">${esc(o.label)}</span>
              <span class="small">${o.reason ? esc(o.reason) : o.method === 'odbior' ? 'ul. Kowalska 12, Wrocław (adres przykładowy) · pon–pt 9–17' : o.method === 'paczkomat' ? 'Odbiór 24/7, SMS z kodem' : 'Doręczenie pod drzwi w 1–2 dni robocze'}</span></span>
            <span class="choice-price mono">${o.method === 'odbior' ? 'gratis' : free && o.free_over_threshold ? 'gratis' : zl(o.price_gr)}</span>
          </label>`).join('')}
        </fieldset>
        <div class="co-grid">
          ${field('co-ship_name', 'Imię i nazwisko odbiorcy', `autocomplete="name" required value="${esc(c?.first_name ?? '')}"`)}
          <div data-ship="paczkomat">${field('co-locker_code', 'Kod Paczkomatu', 'autocomplete="off" placeholder="np. WRO01M" maxlength="9" style="text-transform:uppercase"', 'Mapę Paczkomatów (InPost Geowidget) dodamy w Etapie 5. Na razie wpisz kod ręcznie.')}</div>
        </div>
        <div class="co-grid" data-ship="kurier_inpost">
          ${field('co-ship_street', 'Ulica i numer', 'autocomplete="address-line1"')}
          <div class="co-grid two">
            ${field('co-ship_postcode', 'Kod pocztowy', 'autocomplete="postal-code" inputmode="numeric" placeholder="00-000" maxlength="6"')}
            ${field('co-ship_city', 'Miejscowość', 'autocomplete="address-level2"')}
          </div>
        </div>
      </section>` : ''}

      <section class="co-step">
        <h2 class="h3"><span class="step-no">${physical ? 3 : 2}</span>Płatność</h2>
        <fieldset class="choice-list" id="pay-choices"><legend class="sr-only">Sposób płatności</legend></fieldset>
        <label class="check"><input type="checkbox" name="invoice" id="co-invoice"><span>Chcę fakturę na firmę</span></label>
        <div class="co-grid" id="invoice-fields" hidden>
          ${field('co-bill_company', 'Nazwa firmy', 'autocomplete="organization"')}
          ${field('co-bill_nip', 'NIP', 'inputmode="numeric" placeholder="000-000-00-00" maxlength="13"')}
          ${field('co-bill_street', 'Ulica i numer', 'autocomplete="off"')}
          <div class="co-grid two">
            ${field('co-bill_postcode', 'Kod pocztowy', 'inputmode="numeric" placeholder="00-000" maxlength="6"')}
            ${field('co-bill_city', 'Miejscowość')}
          </div>
        </div>
      </section>

      <section class="co-step">
        <h2 class="h3"><span class="step-no">${physical ? 4 : 3}</span>Uwagi i zgody</h2>
        <div class="field"><label for="co-note">Uwagi do zamówienia <span class="muted">(opcjonalnie)</span></label><textarea id="co-note" name="note" rows="2" maxlength="500" placeholder="np. kolor logo zgodny z Pantone 1795 C"></textarea></div>
        <label class="check"><input type="checkbox" name="terms" id="co-terms"><span>Akceptuję regulamin sklepu i zapoznałem się z polityką prywatności. <span class="muted">(Treść dokumentów dodamy w Etapie 7.)</span></span></label>
        ${digital ? '<label class="check"><input type="checkbox" name="digital_consent" id="co-digital_consent"><span>Chcę otrzymać produkty cyfrowe od razu po płatności. Wiem, że po rozpoczęciu pobierania tracę prawo odstąpienia od umowy.</span></label>' : ''}
        ${q.cart.lines.some((l) => l.product.personalizable) ? '<p class="small">Produkty z logo wykonujemy według Twojego projektu, więc nie można ich zwrócić bez wady. Przed drukiem wyślemy podgląd do akceptacji.</p>' : ''}
      </section>
    </div>

    <aside class="summary co-summary" aria-label="Podsumowanie zamówienia">
      <div id="co-summary">${checkoutSummary(q)}</div>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary" type="submit" id="co-submit">Zamawiam i płacę</button>
      <p class="small">Klikając, składasz zamówienie z obowiązkiem zapłaty.</p>
      <a class="small" href="#koszyk">Wróć do koszyka</a>
    </aside>
  </form>`;

  const form = document.getElementById('checkout-form');
  const payBox = document.getElementById('pay-choices');
  const submit = document.getElementById('co-submit');
  let lastQuote = q;

  const values = () => {
    const d = Object.fromEntries(new FormData(form));
    return {
      ...d,
      locker_code: (d.locker_code ?? '').toUpperCase().trim(),
      invoice: d.invoice === 'on', terms: d.terms === 'on', digital_consent: d.digital_consent === 'on'
    };
  };

  const renderPayments = (opts, selected) => {
    const pick = opts.find((o) => o.method === selected && o.available) ?? opts.find((o) => o.available);
    payBox.innerHTML = '<legend class="sr-only">Sposób płatności</legend>' + opts.map((o) => `<label class="choice${o.available ? '' : ' is-off'}">
      <input type="radio" name="payment_method" value="${o.method}" ${o === pick ? 'checked' : ''} ${o.available ? '' : 'disabled'}>
      <span class="choice-body"><span class="choice-title">${esc(o.label)}${o.provider === 'symulator' ? ' <span class="tag">testowo</span>' : ''}</span>
        <span class="small">${esc(o.reason ?? o.note)}</span></span>
    </label>`).join('');
  };

  const syncShipping = () => {
    const m = form.querySelector('[name="shipping_method"]:checked')?.value;
    form.querySelectorAll('[data-ship]').forEach((el) => { el.hidden = el.dataset.ship !== m; });
  };

  let seq = 0;
  const requote = async () => {
    const v = values();
    const my = ++seq;
    try {
      const nq = await store.quote({ shipping_method: v.shipping_method, payment_method: v.payment_method });
      if (my !== seq) return;
      lastQuote = nq;
      renderPayments(nq.payment_options, v.payment_method);
      // opłata za pobranie zależy od płatności wybranej po przerysowaniu
      const after = values();
      const fq = after.payment_method !== v.payment_method ? await store.quote({ shipping_method: after.shipping_method, payment_method: after.payment_method }) : nq;
      if (my !== seq) return;
      lastQuote = fq;
      document.getElementById('co-summary').innerHTML = checkoutSummary(fq);
      submit.textContent = after.payment_method === 'przelew' || after.payment_method === 'pobranie'
        ? `Zamawiam z obowiązkiem zapłaty · ${zl(fq.totals.total_gr)}` : `Zamawiam i płacę · ${zl(fq.totals.total_gr)}`;
    } catch (err) { toast(err.message, false); }
  };

  renderPayments(q.payment_options, null);
  syncShipping();
  requote();

  form.addEventListener('change', (e) => {
    if (e.target.name === 'shipping_method') { syncShipping(); requote(); }
    if (e.target.name === 'payment_method') requote();
    if (e.target.name === 'invoice') document.getElementById('invoice-fields').hidden = !e.target.checked;
    if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
  });
  form.querySelector('[name="ship_postcode"]')?.addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 5);
    e.target.value = d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
  });
  form.querySelector('[name="bill_postcode"]')?.addEventListener('input', (e) => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 5);
    e.target.value = d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const errBox = form.querySelector('.form-error');
    errBox.hidden = true;
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
    const v = values();
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = 'Składam zamówienie…';
    store.checkout({ ...v, expected_total_gr: lastQuote.totals.total_gr }).then(async (res) => {
      setCart(await store.getCart());
      if (res.warning) toast(res.warning, false);
      follow(res);
    }).catch((err) => {
      errBox.textContent = err.message;
      errBox.hidden = false;
      const bad = err.field && form.querySelector(`[name="${err.field}"]`);
      if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); }
      if (err.status === 409) requote();
      submit.disabled = false;
      submit.textContent = label;
    });
  });
}

// ───────────── Bramka testowa ─────────────

function renderSimulator() {
  return `<div class="gateway" id="gateway"><p class="muted">Łączę z bramką testową…</p></div>`;
}

async function bindSimulator() {
  const box = document.getElementById('gateway');
  const ref = urlParam('platnosc') ?? state.orderRef;
  const token = urlParam('t');
  let p;
  try { p = await state.store.simulation(ref); } catch (err) {
    box.innerHTML = `<div class="empty"><h1 class="h2">Płatność niedostępna</h1><p class="muted">${esc(err.message)}</p><a class="btn" href="#konto">Moje zamówienia</a></div>`;
    return;
  }
  const method = p.method === 'przelewy24' ? 'Przelewy24' : 'Stripe';
  box.innerHTML = `<div class="gw-card">
    <div class="gw-head"><span class="mono">BRAMKA TESTOWA · ${esc(method)}</span><span class="tag">bez prawdziwych pieniędzy</span></div>
    <p class="small">Płatność dla</p>
    <p class="h3">PromoKuźnia · ${esc(p.number)}</p>
    <p class="gw-amount">${zl(p.amount_gr)}</p>
    <div class="blik" aria-hidden="true"><span>BLIK</span><span class="mono">777 123</span></div>
    <p class="small">W prawdziwym sklepie w tym miejscu jest strona ${esc(method)} z BLIK-iem, kartą i przelewem. Tutaj wybierasz wynik płatności, a sklep przechodzi tę samą ścieżkę, co po prawdziwym powiadomieniu z bramki.</p>
    ${p.status === 'utworzona' ? `<div class="gw-actions">
      <button class="btn btn-primary" type="button" data-outcome="paid">Zapłać ${zl(p.amount_gr)}</button>
      <button class="btn" type="button" data-outcome="failed">Odrzuć płatność</button>
    </div>` : `<p class="note">Ta płatność została już rozliczona.</p><button class="btn" type="button" id="gw-back">Wróć do zamówienia</button>`}
  </div>`;
  box.querySelectorAll('[data-outcome]').forEach((b) => b.addEventListener('click', () => {
    box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    b.textContent = b.dataset.outcome === 'paid' ? 'Autoryzuję…' : 'Odrzucam…';
    state.store.simulate(ref, b.dataset.outcome, token).then(follow).catch((err) => {
      toast(err.message, false);
      box.querySelectorAll('button').forEach((x) => { x.disabled = false; });
    });
  }));
  document.getElementById('gw-back')?.addEventListener('click', () => openOrder(p.number, token));
}

// ───────────── Strona zamówienia ─────────────

function renderOrderPage() {
  return `<div id="order-view"><p class="muted">Wczytuję zamówienie…</p></div>`;
}

const SHIP_PL = { paczkomat: 'Paczkomat InPost', kurier_inpost: 'Kurier InPost', odbior: 'Odbiór osobisty', brak: 'Bez wysyłki' };
const PAY_PL = { stripe: 'BLIK / karta (Stripe)', przelewy24: 'Przelewy24', przelew: 'Przelew tradycyjny', pobranie: 'Za pobraniem', symulator: 'Bramka testowa' };
const STEPS = ['czeka_na_platnosc', 'oplacone', 'akceptacja_projektu', 'w_realizacji', 'wyslane', 'dostarczone', 'zrealizowane'];

function orderHeadline(o) {
  if (o.status === 'anulowane') return ['Zamówienie anulowane', 'Nie otrzymaliśmy płatności w terminie, więc zwolniliśmy zarezerwowany towar.'];
  if (o.status === 'czeka_na_platnosc') {
    if (o.payment_method === 'przelew') return ['Czekamy na przelew', 'Towar jest zarezerwowany przez 3 dni. Wyślemy go po zaksięgowaniu wpłaty.'];
    if (o.payment?.status === 'odrzucona') return ['Płatność nie przeszła', 'Zamówienie czeka. Możesz spróbować zapłacić jeszcze raz — towar trzymamy do końca rezerwacji.'];
    return ['Czekamy na potwierdzenie płatności', 'Zwykle trwa to kilka sekund. Strona odświeży się sama.'];
  }
  if (o.status === 'akceptacja_projektu') return ['Dziękujemy, zamówienie opłacone', 'Grafik przygotuje podgląd z Twoim logo i wyśle go mailem do akceptacji. Druk ruszy po Twoim „tak”.'];
  if (o.status === 'zrealizowane') return ['Dziękujemy, wszystko gotowe', 'Pliki do pobrania i kody są poniżej. Wysłaliśmy je też mailem.'];
  if (o.payment_method === 'pobranie') return ['Dziękujemy, przyjęliśmy zamówienie', 'Zapłacisz kurierowi przy odbiorze.'];
  return ['Dziękujemy, zamówienie opłacone', 'Przekazaliśmy je do realizacji. Numer przesyłki wyślemy mailem.'];
}

async function bindOrderPage() {
  const box = document.getElementById('order-view');
  const number = urlParam('zamowienie') ?? state.orderRef;
  const token = urlParam('t');
  if (!number) { box.innerHTML = '<div class="empty"><p class="muted">Brak numeru zamówienia.</p><a class="btn" href="#konto">Moje konto</a></div>'; return; }

  let o;
  try { o = await state.store.getOrder(number, token); } catch (err) {
    box.innerHTML = `<div class="empty"><h1 class="h2">Nie znaleziono zamówienia</h1><p class="muted">${esc(err.message)}</p><a class="btn" href="#konto">Zaloguj się</a></div>`;
    return;
  }
  const [title, lead] = orderHeadline(o);
  const reached = new Set(o.events.map((e) => e.status));
  const path = STEPS.filter((st) => reached.has(st) || (st !== 'akceptacja_projektu' && st !== 'oplacone') || (st === 'oplacone' && o.payment_method !== 'pobranie'))
    .filter((st) => !(st === 'akceptacja_projektu' && !o.items.some((i) => i.project_status)))
    .filter((st) => !(['wyslane', 'dostarczone'].includes(st) && o.shipping_method === 'brak'));
  const current = path.indexOf(o.status);
  const addr = o.shipping;

  box.innerHTML = `
  <div class="page-head">
    <div class="crumbs"><a href="#start">Start</a><span>/</span><span>Zamówienie ${esc(o.number)}</span></div>
    <p class="eyebrow">Zamówienie ${esc(o.number)} · ${new Date(o.created_at).toLocaleString('pl-PL', { dateStyle: 'long', timeStyle: 'short' })}</p>
    <h1 class="h2">${esc(title)}</h1>
    <p class="lead">${esc(lead)}</p>
  </div>
  ${o.status !== 'anulowane' ? `<ol class="track" aria-label="Postęp zamówienia">${path.map((st, i) => `<li data-state="${i < current ? 'done' : i === current ? 'now' : 'todo'}"><span>${esc(STATUS_PL[st])}</span></li>`).join('')}</ol>` : ''}

  <div class="order-grid">
    <div class="order-main">
      ${o.can_pay ? `<div class="callout"><div><p class="h3">Zapłać ${zl(o.totals.total_gr)}</p><p class="small">${o.reserved_until ? `Rezerwacja do ${new Date(o.reserved_until).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}.` : ''}</p></div><button class="btn btn-primary" type="button" id="pay-again">Przejdź do płatności</button></div>` : ''}
      ${o.bank_transfer ? `<div class="callout transfer">
        <p class="h3">Dane do przelewu</p>
        <table class="spec"><tbody>
          <tr><th>Odbiorca</th><td>${esc(o.bank_transfer.recipient)}</td></tr>
          <tr><th>Numer konta</th><td>${esc(o.bank_transfer.account)} <button type="button" class="link-btn" data-copy="${esc(o.bank_transfer.account.replace(/\s/g, ''))}">Kopiuj</button></td></tr>
          <tr><th>Tytuł</th><td>${esc(o.bank_transfer.title)} <button type="button" class="link-btn" data-copy="${esc(o.bank_transfer.title)}">Kopiuj</button></td></tr>
          <tr><th>Kwota</th><td>${zl(o.bank_transfer.amount_gr)}</td></tr>
        </tbody></table>
        ${o.bank_transfer.demo ? '<p class="small">Numer konta jest przykładowy — sklep jest demonstracyjny, nie wpłacaj pieniędzy.</p>' : ''}
      </div>` : ''}
      ${o.downloads.length ? `<section><h2 class="h3">Do pobrania</h2><ul class="plain dl-list">${o.downloads.map((d) => `<li>
        ${d.url ? `<a class="btn" href="${esc(d.url)}">Pobierz: ${esc(d.name)}</a>` : `<span class="btn" aria-disabled="true">${esc(d.name)}</span>`}
        <span class="small">${d.url ? `Zostało ${d.left} pobrań, link ważny do ${new Date(d.expires_at).toLocaleDateString('pl-PL')}.` : 'W podglądzie bez serwera pliki nie są generowane.'}</span></li>`).join('')}</ul></section>` : ''}
      ${o.gift_cards.length ? `<section><h2 class="h3">Karty podarunkowe</h2><ul class="plain">${o.gift_cards.map((g) => `<li class="gift"><span class="mono">${esc(g.code)}</span><span>${zl(g.balance_gr)}</span><span class="small">ważna do ${new Date(g.valid_until).toLocaleDateString('pl-PL')}</span></li>`).join('')}</ul></section>` : ''}

      <section>
        <h2 class="h3">Produkty</h2>
        <table class="spec order-items"><tbody>
          ${o.items.map((i) => `<tr><th scope="row">${esc(i.name)}<br><span class="small mono">${esc(i.variant_label)} · ${esc(i.sku)}${i.project_status ? ` · ${i.has_file ? 'plik dołączony' : 'plik do dosłania'}` : ''}</span></th><td>${i.qty} × ${zl(i.unit_price_gr)}</td><td class="num">${zl(i.line_total_gr)}</td></tr>`).join('')}
        </tbody></table>
        <dl class="order-totals">
          <dt>Produkty</dt><dd>${zl(o.totals.subtotal_gr)}</dd>
          ${o.totals.discount_gr ? `<dt>Rabat ${esc(o.totals.coupon_code ?? '')}</dt><dd>−${zl(o.totals.discount_gr)}</dd>` : ''}
          ${o.shipping_method !== 'brak' ? `<dt>Dostawa</dt><dd>${o.totals.shipping_gr ? zl(o.totals.shipping_gr) : 'gratis'}</dd>` : ''}
          <dt class="total">Razem</dt><dd class="total">${zl(o.totals.total_gr)}</dd>
          <dt>w tym VAT</dt><dd>${zl(o.totals.vat_gr)}</dd>
        </dl>
      </section>
    </div>

    <aside class="order-side">
      <div class="panel">
        <div><p class="eyebrow">Dostawa</p><p>${esc(SHIP_PL[o.shipping_method] ?? o.shipping_method)}${o.locker_code ? ` · <span class="mono">${esc(o.locker_code)}</span>` : ''}</p>
          ${addr ? `<p class="small">${esc(addr.name ?? '')}${addr.street ? `<br>${esc(addr.street)}, ${esc(addr.postcode)} ${esc(addr.city)}` : ''}</p>` : ''}</div>
        <div><p class="eyebrow">Płatność</p><p>${esc(PAY_PL[o.payment_method] ?? o.payment_method)}</p>
          ${o.payment ? `<p class="small">Status: ${esc({ utworzona: 'oczekuje', oplacona: 'opłacona', odrzucona: 'odrzucona', zwrocona: 'zwrócona' }[o.payment.status] ?? o.payment.status)}${o.payment.provider === 'symulator' ? ' · bramka testowa' : ''}</p>` : ''}</div>
        ${o.billing ? `<div><p class="eyebrow">Faktura</p><p class="small">${esc(o.billing.company)}<br>NIP ${esc(o.billing.nip)}<br>${esc(o.billing.street)}, ${esc(o.billing.postcode)} ${esc(o.billing.city)}</p></div>` : ''}
        <div><p class="eyebrow">Historia</p><ol class="plain history">${o.events.map((e) => `<li><span class="mono small">${new Date(e.at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</span> ${esc(e.label)}${e.note ? `<br><span class="small">${esc(e.note)}</span>` : ''}</li>`).join('')}</ol></div>
      </div>
      ${token && !state.customer ? '<p class="small">Zachowaj ten link — to Twój dostęp do zamówienia bez konta. Wysłaliśmy go też mailem (maile ruszą w Etapie 6).</p>' : ''}
    </aside>
  </div>`;

  document.getElementById('pay-again')?.addEventListener('click', (e) =>
    run(e.currentTarget, async () => follow(await state.store.retryPay(o.number, token))));
  box.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast('Skopiowano.', false); } catch { toast(b.dataset.copy, false); }
  }));

  // czekamy na powiadomienie z bramki (po powrocie ze Stripe/P24 płatność dochodzi webhookiem)
  if (o.status === 'czeka_na_platnosc' && o.payment?.status === 'utworzona' && o.can_pay && state.store.mode === 'api' && document.contains(box)) {
    state.pollCount = (state.pollCount ?? 0) + 1;
    if (state.pollCount <= 10) setTimeout(() => { if (location.hash === '#zamowienie') bindOrderPage(); }, 3000);
  } else state.pollCount = 0;
}

// ───────────── Router ─────────────

let toastTimer;
function toast(text, withLink = true) {
  toastEl.innerHTML = `<span>${esc(text)}</span>${withLink ? '<a href="#koszyk">Zobacz koszyk</a>' : ''}`;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3500);
}

function renderNav(route) {
  catNav.innerHTML = [
    `<a href="#wszystkie" ${route === 'wszystkie' ? 'aria-current="page"' : ''}>Wszystko</a>`,
    ...state.categories.map((c) => `<a href="#kategoria-${esc(c.slug)}" ${route === `kategoria-${c.slug}` ? 'aria-current="page"' : ''}>${esc(c.name)}</a>`)
  ].join('');
}

function render() {
  const route = decodeURIComponent(location.hash.slice(1)) || 'start';
  let html = '';
  let title = 'PromoKuźnia';
  let after = null;

  if (route === 'start') {
    html = renderHome();
  } else if (route === 'wszystkie') {
    html = listing({ title: 'Cały asortyment', lead: 'Druk, gadżety, systemy wystawiennicze, szablony cyfrowe, usługi i karty podarunkowe.', crumbs: '<span>Wszystko</span>', products: state.products });
    title = 'Cały asortyment — PromoKuźnia';
  } else if (route.startsWith('kategoria-')) {
    const cat = state.categories.find((c) => `kategoria-${c.slug}` === route);
    if (cat) {
      html = listing({ title: cat.name, lead: cat.lead, crumbs: `<span>${esc(cat.name)}</span>`, products: state.products.filter((p) => p.category === cat.slug) });
      title = `${cat.name} — PromoKuźnia`;
    }
  } else if (route === 'szukaj') {
    const q = state.query.toLocaleLowerCase('pl');
    const found = state.products.filter((p) => `${p.name} ${p.short} ${p.category}`.toLocaleLowerCase('pl').includes(q));
    html = listing({ title: q ? `Wyniki: „${state.query}”` : 'Szukaj', lead: '', crumbs: '<span>Szukaj</span>', products: found });
  } else if (route.startsWith('p-')) {
    const p = state.bySlug[route.slice(2)];
    if (p) { html = renderProduct(p); title = `${p.name} — PromoKuźnia`; after = () => bindProduct(p); }
  } else if (route === 'koszyk') {
    html = renderCart(); title = 'Koszyk — PromoKuźnia'; after = bindCart;
  } else if (route === 'konto') {
    html = renderAccount(); title = 'Konto — PromoKuźnia'; after = bindAccount;
  } else if (route === 'reset-hasla') {
    html = renderResetRequest(); title = 'Reset hasła — PromoKuźnia'; after = bindResetRequest;
  } else if (route === 'kasa') {
    html = renderCheckout(); title = 'Kasa — PromoKuźnia'; after = bindCheckout;
  } else if (route === 'symulator-platnosci') {
    html = renderSimulator(); title = 'Płatność testowa — PromoKuźnia'; after = bindSimulator;
  } else if (route === 'zamowienie') {
    html = renderOrderPage(); title = 'Zamówienie — PromoKuźnia'; after = bindOrderPage;
  } else if (route === 'nowe-haslo') {
    html = renderNewPassword(); title = 'Nowe hasło — PromoKuźnia'; after = bindNewPassword;
  }

  if (!html) {
    html = `<div class="empty"><p class="eyebrow">404</p><h1 class="h2">Nie ma takiej strony.</h1><p class="muted">Link mógł się zdezaktualizować. Wróć do katalogu.</p><a class="btn btn-primary" href="#start">Strona główna</a></div>`;
  }

  view.innerHTML = html;
  document.title = title;
  renderNav(route);
  const sortSel = document.getElementById('sort-select');
  if (sortSel) {
    sortSel.value = state.sort;
    sortSel.addEventListener('change', () => { state.sort = sortSel.value; render(); });
  }
  after?.();
}

async function onRoute() {
  // koszyk zawsze świeży z serwera (stany i ceny mogły się zmienić)
  if (location.hash === '#koszyk') { try { setCart(await state.store.getCart()); } catch { /* pokażemy ostatni znany */ } }
  render();
  window.scrollTo({ top: 0 });
  view.focus({ preventScroll: true });
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  state.query = searchInput.value.trim();
  if (location.hash === '#szukaj') render(); else location.hash = 'szukaj';
});
searchInput.addEventListener('input', () => {
  if (location.hash === '#szukaj') { state.query = searchInput.value.trim(); render(); }
});
window.addEventListener('hashchange', onRoute);

// ───────────── Start ─────────────

view.innerHTML = '<p class="muted">Ładuję katalog…</p>';
loadCatalog().then(async (data) => {
  state.categories = [...data.categories].sort((a, b) => a.sort - b.sort);
  state.products = data.products;
  state.source = data.source;
  for (const p of state.products) {
    state.bySlug[p.slug] = p;
    for (const v of p.variants) state.byVariant[v.id] = { product: p, variant: v };
  }
  state.store = data.source === 'api' ? apiStore : createLocalStore(data, window.__DEMO_COUPONS__ ?? []);
  const [cart, customer] = await Promise.all([state.store.getCart(), state.store.me()]);
  setCart(cart);
  setCustomer(customer);
  render();
}).catch((err) => {
  console.error(err);
  view.innerHTML = '<div class="empty"><h1 class="h2">Nie udało się wczytać katalogu.</h1><p class="muted">Sprawdź połączenie i odśwież stronę.</p></div>';
});
