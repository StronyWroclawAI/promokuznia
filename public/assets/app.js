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
      <button class="btn btn-primary" type="button" disabled>Przejdź do kasy</button>
      <p class="small">${blocked ? 'Popraw ilości oznaczone na czerwono. ' : ''}Kasa, BLIK i Przelewy24 w trybie testowym powstaną w Etapie 4.</p>
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
  setCustomer(customer);
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
          `<tr><td>${esc(o.number)}</td><td>${new Date(o.created_at).toLocaleDateString('pl-PL')}</td><td>${esc(STATUS_PL[o.status] ?? o.status)}</td><td>${zl(o.total_gr)}</td></tr>`).join('')}</tbody></table>`
        : '<div class="empty" style="padding:0"><p class="muted">Nie masz jeszcze zamówień. Składanie zamówień ruszy w Etapie 4.</p><a class="btn" href="#wszystkie">Przejrzyj asortyment</a></div>';
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
