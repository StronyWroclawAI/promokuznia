// Plik Excel z produktami: kolumny, szablon do pobrania, eksport katalogu i zamiana wierszy na produkty.
// Jeden wiersz = jeden wariant. Kolejne warianty tego samego produktu mają ten sam slug albo puste
// kolumny produktu (wtedy należą do produktu z wiersza wyżej).
import { writeXlsx, STYLE } from './xlsx.js';

export const COLUMNS = [
  { key: 'slug', header: 'slug', width: 26, help: 'Adres produktu w sklepie, np. kubek-emaliowany. Puste = utworzymy z nazwy. Ten sam slug w kolejnych wierszach = kolejne warianty. Istniejący slug = aktualizacja produktu.' },
  { key: 'name', header: 'nazwa', width: 30, required: true, help: 'Nazwa produktu, 2–120 znaków.' },
  { key: 'category', header: 'kategoria', width: 22, required: true, help: 'Slug kategorii z arkusza „Słowniki” (np. gadzety-z-logo) albo jej nazwa.' },
  { key: 'type', header: 'typ', width: 18, required: true, help: 'fizyczny, cyfrowy, usługa albo karta podarunkowa.' },
  { key: 'short', header: 'opis krótki', width: 40, help: 'Jedno zdanie na kartę produktu, do 300 znaków.' },
  { key: 'description', header: 'opis', width: 60, help: 'Pełny opis na stronie produktu, do 5000 znaków.' },
  { key: 'vat_rate', header: 'VAT %', width: 9, help: '23, 8, 5 lub 0. Puste = 23. Karta podarunkowa: zw.' },
  { key: 'personalizable', header: 'personalizacja', width: 14, help: 'tak = klient wgrywa plik z logo, a sklep wysyła podgląd do akceptacji.' },
  { key: 'lead_time_days', header: 'czas realizacji (dni)', width: 12, help: 'Dni robocze od akceptacji projektu do wysyłki, 0–90.' },
  { key: 'weight_g', header: 'waga (g)', width: 10, help: 'Waga przesyłki w gramach. Wymagana dla produktów fizycznych.' },
  { key: 'dims', header: 'wymiary paczki (cm)', width: 16, help: 'Dł. x szer. x wys., np. 30x20x5. Opcjonalnie.' },
  { key: 'shipping_class', header: 'wysyłka', width: 12, help: 'paczkomat (Paczkomat i kurier) albo kurier (tylko kurier, za duże na Paczkomat).' },
  { key: 'parcel_size', header: 'gabaryt', width: 9, help: 'Gabaryt Paczkomatu: A, B albo C. Puste = A.' },
  { key: 'specs', header: 'specyfikacja', width: 50, help: 'Pary „Cecha: wartość” rozdzielone znakiem |, np. Pojemność: 330 ml | Materiał: ceramika' },
  { key: 'badges', header: 'etykiety', width: 16, help: 'Do 3 etykiet po przecinku, np. Nowość, Bestseller, Promocja.' },
  { key: 'compare_at', header: 'cena przed obniżką (zł)', width: 14, money: true, help: 'Przekreślona cena przy promocji. Musi być wyższa od ceny wariantu. Puste = bez promocji.' },
  { key: 'active', header: 'widoczny', width: 10, help: 'tak / nie. Puste = tak. „nie” ukrywa produkt w sklepie.' },
  { key: 'images', header: 'zdjęcia (URL)', width: 50, help: 'Adresy zdjęć https:// rozdzielone średnikiem. Pierwsze jest główne. Własne zdjęcia wgrasz też w panelu przy produkcie.' },
  { key: 'variant', header: 'wariant', width: 18, required: true, help: 'Nazwa wariantu, np. 100 szt., M, Biały. Jeden wariant bez nazwy = „Standard”.' },
  { key: 'sku', header: 'SKU', width: 18, help: 'Kod wariantu. Puste = nadamy automatycznie. Istniejący SKU = aktualizacja tego wariantu.' },
  { key: 'price', header: 'cena brutto (zł)', width: 13, required: true, money: true, help: 'Cena brutto wariantu w złotych, np. 49,90.' },
  { key: 'stock', header: 'stan (szt.)', width: 11, help: 'Liczba sztuk w magazynie. Puste = bez limitu (produkcja na zamówienie, cyfrowe, usługi).' }
];

const TYPE_PL = { physical: 'fizyczny', digital: 'cyfrowy', service: 'usługa', gift_card: 'karta podarunkowa' };
const norm = (s) => String(s ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const TYPE_IN = {
  fizyczny: 'physical', physical: 'physical', towar: 'physical',
  cyfrowy: 'digital', digital: 'digital', 'do pobrania': 'digital', 'produkt cyfrowy': 'digital',
  usluga: 'service', service: 'service',
  'karta podarunkowa': 'gift_card', karta: 'gift_card', bon: 'gift_card', gift_card: 'gift_card', 'gift card': 'gift_card'
};
const YES = new Set(['tak', 't', 'yes', 'y', '1', 'true', 'x', 'prawda']);
const NO = new Set(['nie', 'n', 'no', '0', 'false', 'falsz']);

export function slugify(text) {
  return String(text ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}

const zlToGr = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v).replace(/\s|zł|zl|pln/gi, '').replace(',', '.');
  const n = Number(s);
  return s && Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
const blank = (v) => v === '' || v === null || v === undefined || (typeof v === 'string' && !v.trim());

// ───────────── Szablon i eksport ─────────────

const widths = COLUMNS.map((c) => c.width);
const required = new Set(COLUMNS.map((c, i) => (c.required ? i : -1)).filter((i) => i >= 0));
const colStyles = Object.fromEntries(COLUMNS.map((c, i) => [i, c.money ? STYLE.money : c.key === 'description' || c.key === 'specs' ? STYLE.wrap : 0]).filter(([, s]) => s));
const idx = (key) => COLUMNS.findIndex((c) => c.key === key);

function validations(categories) {
  return [
    { col: idx('category'), list: categories.map((c) => c.slug) },
    { col: idx('type'), list: Object.values(TYPE_PL) },
    { col: idx('vat_rate'), list: ['23', '8', '5', '0', 'zw'] },
    { col: idx('personalizable'), list: ['tak', 'nie'] },
    { col: idx('shipping_class'), list: ['paczkomat', 'kurier'] },
    { col: idx('parcel_size'), list: ['A', 'B', 'C'] },
    { col: idx('active'), list: ['tak', 'nie'] }
  ];
}

export function productToRows(p) {
  const base = {
    slug: p.slug, name: p.name, category: p.category, type: TYPE_PL[p.type] ?? p.type, short: p.short, description: p.description,
    vat_rate: p.vat_rate === null ? 'zw' : p.vat_rate, personalizable: p.personalizable ? 'tak' : 'nie',
    lead_time_days: p.lead_time_days, weight_g: p.weight_g ?? '', dims: p.dims_cm ? p.dims_cm.join('x') : '',
    shipping_class: p.shipping_class ?? '', parcel_size: p.parcel_size ?? '',
    specs: (p.specs ?? []).map(([k, v]) => `${k}: ${v}`).join(' | '), badges: (p.badges ?? []).join(', '),
    compare_at: p.compare_at_gr ? p.compare_at_gr / 100 : '', active: p.active === false ? 'nie' : 'tak',
    images: (p.images ?? []).map((im) => (typeof im === 'string' ? im : im.src)).join('; ')
  };
  const variants = (p.variants ?? []).filter((v) => v.active !== false);
  return (variants.length ? variants : [{}]).map((v, i) => COLUMNS.map((c) => {
    if (c.key === 'variant') return v.label ?? '';
    if (c.key === 'sku') return v.sku ?? '';
    if (c.key === 'price') return v.price_gr ? v.price_gr / 100 : '';
    if (c.key === 'stock') return v.stock ?? '';
    if (c.key === 'slug') return base.slug;
    return i === 0 ? base[c.key] ?? '' : '';
  }));
}

function instructionsSheet(categories) {
  const rows = [
    ['Import produktów — PromoKuźnia'],
    [''],
    ['Jak to działa'],
    ['1. Wypełnij arkusz „Produkty”: jeden wiersz to jeden wariant (np. nakład, rozmiar, kolor).'],
    ['2. Produkt z kilkoma wariantami: dane produktu wpisz w pierwszym wierszu, w kolejnych tylko slug (albo nic) i kolumny wariantu.'],
    ['3. Kolumny z różowym nagłówkiem są wymagane. Listy rozwijane podpowiadają dozwolone wartości.'],
    ['4. Zapisz plik jako .xlsx i wczytaj w panelu: Produkty → Import z Excela. Przed zapisem zobaczysz podgląd i błędy.'],
    ['5. Istniejący slug aktualizuje produkt, istniejący SKU aktualizuje wariant. Warianty, których nie ma w pliku, zostaną wyłączone (nie usunięte).'],
    ['6. Zmiana ceny trafia do historii cen — sklep sam pokaże najniższą cenę z 30 dni przy promocji (Omnibus).'],
    ['7. Przykład wypełnienia jest w arkuszu „Przykład”. Ten arkusz i „Słowniki” są pomijane przy imporcie.'],
    [''],
    ['Kolumna', 'Wymagana', 'Opis'],
    ...COLUMNS.map((c) => [c.header, c.required ? 'tak' : '', c.help])
  ];
  const cellStyles = { '0,0': STYLE.title, '2,0': STYLE.title };
  for (let c = 0; c < 3; c++) cellStyles[`11,${c}`] = STYLE.header;
  return { name: 'Instrukcja', rows, widths: [26, 10, 110], cellStyles };
}

function dictionarySheet(categories) {
  const rows = [['kategoria (slug)', 'nazwa kategorii', '', 'typ', '', 'VAT %', '', 'wysyłka', '', 'gabaryt Paczkomatu']];
  const cols = [categories.map((c) => [c.slug, c.name]), Object.values(TYPE_PL).map((t) => [t]), [['23'], ['8'], ['5'], ['0'], ['zw (tylko karta podarunkowa)']],
    [['paczkomat'], ['kurier']], [['A — do 8 × 38 × 64 cm'], ['B — do 19 × 38 × 64 cm'], ['C — do 41 × 38 × 64 cm']]];
  const offsets = [0, 3, 5, 7, 9];
  const n = Math.max(...cols.map((c) => c.length));
  for (let r = 0; r < n; r++) {
    const row = Array(10).fill('');
    cols.forEach((list, i) => { (list[r] ?? []).forEach((v, j) => { row[offsets[i] + j] = v; }); });
    rows.push(row);
  }
  return { name: 'Słowniki', rows, headerRow: true, widths: [24, 26, 3, 18, 3, 24, 3, 12, 3, 24] };
}

const EXAMPLE = [
  { slug: 'kubek-emaliowany-z-logo', name: 'Kubek emaliowany z logo', category: 'gadzety-z-logo', type: 'physical', short: 'Kubek emaliowany 350 ml z nadrukiem jednego koloru.', description: 'Lekki kubek ze stali emaliowanej — na biwak, do biura i na prezent dla klientów. Nadruk sitodrukiem w jednym kolorze.', vat_rate: 23, personalizable: true, lead_time_days: 7, weight_g: 1200, dims_cm: [30, 20, 15], shipping_class: 'paczkomat', parcel_size: 'B', specs: [['Pojemność', '350 ml'], ['Materiał', 'stal emaliowana'], ['Nadruk', '1 kolor, sitodruk']], badges: ['Nowość'], compare_at_gr: null, active: true, images: ['https://images.pexels.com/photos/4264049/pexels-photo-4264049.jpeg?auto=compress&cs=tinysrgb&w=1200'], variants: [{ label: '10 szt.', sku: '', price_gr: 34900, stock: 200 }, { label: '50 szt.', sku: '', price_gr: 149900, stock: 200 }] },
  { slug: '', name: 'Szablon newslettera', category: 'produkty-cyfrowe', type: 'digital', short: 'Gotowy szablon newslettera do Canvy i MailerLite.', description: 'Pięć układów newslettera w Twoich kolorach. Link do pobrania przychodzi mailem po płatności.', vat_rate: 23, personalizable: false, lead_time_days: 0, specs: [['Format', 'Canva, HTML'], ['Liczba układów', '5']], badges: [], active: true, images: [], variants: [{ label: 'Standard', price_gr: 7900, stock: null }] }
];

export function templateXlsx(categories) {
  const head = COLUMNS.map((c) => c.header);
  const productSheet = { name: 'Produkty', rows: [head], headerRow: true, freeze: true, widths, required, colStyles, validations: validations(categories) };
  const exampleSheet = { name: 'Przykład', rows: [head, ...EXAMPLE.flatMap(productToRows)], headerRow: true, freeze: true, widths, required, colStyles };
  return writeXlsx([productSheet, exampleSheet, instructionsSheet(categories), dictionarySheet(categories)]);
}

export function exportXlsx(products, categories) {
  const head = COLUMNS.map((c) => c.header);
  return writeXlsx([
    { name: 'Produkty', rows: [head, ...products.flatMap(productToRows)], headerRow: true, freeze: true, widths, required, colStyles, validations: validations(categories) },
    instructionsSheet(categories),
    dictionarySheet(categories)
  ]);
}

// ───────────── Wczytanie ─────────────

// Wybiera arkusz z produktami: „Produkty”, a gdy go nie ma — pierwszy z nagłówkiem „nazwa”
export function pickSheet(sheets) {
  const hasHeader = (s) => s.rows.slice(0, 10).some((r) => r.some((v) => norm(v) === 'nazwa'));
  return sheets.find((s) => norm(s.name) === 'produkty' && hasHeader(s)) ?? sheets.find((s) => !['przyklad', 'instrukcja', 'slowniki'].includes(norm(s.name)) && hasHeader(s)) ?? null;
}

// rows → { products, issues }. products mają kształt jak formularz w panelu (+ _row: numer wiersza w Excelu).
export function rowsToProducts(rows, categories) {
  const issues = [];
  const headerAt = rows.findIndex((r) => r?.some((v) => norm(v) === 'nazwa'));
  if (headerAt < 0) return { products: [], issues: [{ row: null, message: 'Nie znaleziono wiersza nagłówka (kolumny „nazwa”). Użyj szablonu z panelu.' }] };
  const header = rows[headerAt].map(norm);
  const pos = {};
  COLUMNS.forEach((c) => {
    const want = norm(c.header);
    let i = header.indexOf(want);
    if (i < 0) i = header.findIndex((h) => h && (h.startsWith(want) || want.startsWith(h)) && h.length > 2);
    if (i >= 0) pos[c.key] = i;
  });
  const missing = COLUMNS.filter((c) => c.required && pos[c.key] === undefined).map((c) => c.header);
  if (missing.length) return { products: [], issues: [{ row: headerAt + 1, message: `Brak kolumn: ${missing.join(', ')}.` }] };

  const catBy = new Map();
  for (const c of categories) { catBy.set(norm(c.slug), c.slug); catBy.set(norm(c.name), c.slug); }

  const map = new Map();
  let current = null;
  for (let r = headerAt + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const get = (k) => (pos[k] === undefined ? '' : row[pos[k]] ?? '');
    const s = (k) => (blank(get(k)) ? '' : String(get(k)).trim());
    if (COLUMNS.every((c) => blank(get(c.key)))) continue;
    const excelRow = r + 1;
    let p;
    const note = (m) => { issues.push({ row: excelRow, message: m }); p?._warnings.push(`Wiersz ${excelRow}: ${m}`); };

    const key = s('slug').toLowerCase() || slugify(s('name'));
    if (key) {
      p = map.get(key);
      if (!p) { p = { _row: excelRow, _key: key, slug: s('slug').toLowerCase(), variants: [], _warnings: [], _set: new Set() }; map.set(key, p); }
    } else if (current) p = current;
    else { note('Wiersz bez nazwy i sluga — nie wiadomo, do którego produktu należy.'); continue; }
    current = p;

    const set = (field, value) => { if (!p._set.has(field) && value !== undefined && value !== '') { p[field] = value; p._set.add(field); } };
    set('name', s('name'));
    if (s('category')) {
      const cat = catBy.get(norm(s('category')));
      if (cat) set('category', cat); else { set('category', s('category')); }
    }
    if (s('type')) {
      const t = TYPE_IN[norm(s('type'))] ?? TYPE_IN[s('type').toLowerCase()];
      if (t) set('type', t); else { note(`Nieznany typ „${s('type')}”.`); set('type', s('type')); }
    }
    set('short', s('short'));
    set('description', s('description'));
    if (s('vat_rate')) {
      const raw = s('vat_rate').toLowerCase();
      if (/^(zw|np|brak)/.test(raw)) set('vat_rate', null);
      else { let n = num(String(raw).replace('%', '')); if (n > 0 && n < 1) n = Math.round(n * 100); set('vat_rate', n); }
    }
    if (s('personalizable')) set('personalizable', YES.has(norm(s('personalizable'))));
    if (s('lead_time_days')) set('lead_time_days', num(s('lead_time_days')));
    if (s('weight_g')) set('weight_g', num(s('weight_g')));
    if (s('dims')) {
      const d = s('dims').split(/\s*[x×*,;\s]\s*/i).filter(Boolean).map(num);
      set('dims_cm', d);
    }
    if (s('shipping_class')) set('shipping_class', norm(s('shipping_class')));
    if (s('parcel_size')) set('parcel_size', s('parcel_size').toUpperCase().slice(0, 1));
    if (s('specs')) {
      const specs = s('specs').split(/\s*[|\n]\s*/).filter(Boolean).map((pair) => {
        const at = pair.indexOf(':');
        if (at < 1) { note(`Specyfikacja „${pair}” — brakuje dwukropka (Cecha: wartość).`); return null; }
        return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()];
      }).filter(Boolean);
      set('specs', specs);
    }
    if (s('badges')) set('badges', s('badges').split(/\s*[,;]\s*/).filter(Boolean));
    if (s('compare_at')) set('compare_at_gr', zlToGr(get('compare_at')));
    if (s('active')) set('active', !NO.has(norm(s('active'))));
    if (s('images')) set('images', s('images').split(/[\s;]+/).filter(Boolean).map((src) => ({ src, alt: '' })));

    if (!blank(get('variant')) || !blank(get('price')) || !blank(get('sku'))) {
      const price = zlToGr(get('price'));
      if (price === null) note('Brak ceny wariantu.');
      else if (Number.isNaN(price)) note(`Cena „${get('price')}” nie jest liczbą.`);
      const stock = blank(get('stock')) ? null : num(get('stock'));
      if (Number.isNaN(stock)) note(`Stan „${get('stock')}” nie jest liczbą.`);
      p.variants.push({ label: s('variant'), sku: s('sku').toUpperCase(), price_gr: price, stock });
    }
  }

  const products = [...map.values()].map((p) => {
    const { _set, _key, ...rest } = p;
    return { images: [], specs: [], badges: [], ...rest };
  });
  return { products, issues };
}
