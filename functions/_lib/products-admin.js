// Dodawanie i edycja produktów z panelu — pojedynczo (formularz) i hurtowo (import z Excela).
// Jedna walidacja dla obu dróg: normalizeProduct() sprawdza dane, saveProduct() zapisuje produkt
// z wariantami i zdjęciami w jednej transakcji D1 (db.batch). Klucz produktu to slug, wariantu — SKU.

export const TYPES = ['physical', 'digital', 'service', 'gift_card'];
export const VAT_RATES = [23, 8, 5, 0];
export const SKU_PREFIX = {
  'druk-firmowy': 'DR', 'gadzety-z-logo': 'GD', 'systemy-wystawiennicze': 'SW',
  'produkty-cyfrowe': 'CY', 'uslugi': 'US', 'karty-podarunkowe': 'KP',
  'wizytowki': 'WZ', 'plakaty': 'PL'
};
// ilustracja zastępcza, gdy zdjęcie się nie wczyta
const ART_BY_CATEGORY = {
  'druk-firmowy': 'flyer', 'gadzety-z-logo': 'mug', 'systemy-wystawiennicze': 'rollup',
  'produkty-cyfrowe': 'grid', 'uslugi': 'pentool', 'karty-podarunkowe': 'gift',
  'wizytowki': 'card', 'plakaty': 'flyer'
};
const GPSR = {
  name: 'PromoKuźnia (dane przykładowe — sklep demonstracyjny)',
  address: 'ul. Kowalska 12, 50-000 Wrocław',
  contact: 'bezpieczenstwo@promokuznia.pl'
};

const LIMITS = { variants: 30, images: 8, specs: 20, badges: 3 };

export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

const str = (v, max) => (v === null || v === undefined ? '' : String(v).trim().slice(0, max));
const intOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
const isImageSrc = (s) => /^https:\/\/[^\s"'<>]+$/i.test(s) || /^\/api\/images\/products\/[\w.\-/]+$/.test(s);

// Zwraca { value, errors }. errors to lista zdań po polsku — gotowa do pokazania w panelu.
export function normalizeProduct(input, categorySlugs) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!input || typeof input !== 'object') return { value: null, errors: ['Brak danych produktu.'] };

  const name = str(input.name, 120);
  if (name.length < 2) err('Podaj nazwę produktu (min. 2 znaki).');
  let slug = str(input.slug, 80).toLowerCase();
  if (!slug) slug = slugify(name);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) err(`Adres (slug) „${slug}” może mieć tylko małe litery bez polskich znaków, cyfry i myślniki.`);

  const category = str(input.category, 60);
  if (!categorySlugs.includes(category)) err(`Nieznana kategoria „${category}”. Dostępne: ${categorySlugs.join(', ')}.`);
  const type = str(input.type, 20);
  if (!TYPES.includes(type)) err('Typ musi być jednym z: fizyczny, cyfrowy, usługa, karta podarunkowa.');
  const physical = type === 'physical';

  let vat = input.vat_rate === '' || input.vat_rate === undefined ? (type === 'gift_card' ? null : 23) : input.vat_rate;
  if (vat !== null) vat = Number(vat);
  if (vat === null ? type !== 'gift_card' : !VAT_RATES.includes(vat)) err('Stawka VAT: 23, 8, 5 lub 0 (bez VAT — tylko karta podarunkowa).');

  const lead = intOrNull(input.lead_time_days) ?? 0;
  if (!(lead >= 0 && lead <= 90)) err('Czas realizacji: od 0 do 90 dni.');

  let weight = null, dims = null, shipping = null, parcel = null;
  if (physical) {
    weight = intOrNull(input.weight_g);
    if (!(weight > 0 && weight <= 30000)) err('Produkt fizyczny potrzebuje wagi przesyłki w gramach (1–30 000).');
    if (Array.isArray(input.dims_cm) && input.dims_cm.some((d) => d !== null && d !== '')) {
      dims = input.dims_cm.slice(0, 3).map(intOrNull);
      if (dims.length !== 3 || dims.some((d) => !(d > 0 && d <= 300))) err('Wymiary paczki podaj jako trzy liczby w cm, np. 30x20x5.');
    }
    shipping = str(input.shipping_class, 10) || 'paczkomat';
    if (!['paczkomat', 'kurier'].includes(shipping)) err('Wysyłka: paczkomat albo kurier.');
    parcel = str(input.parcel_size, 1).toUpperCase() || (shipping === 'paczkomat' ? 'A' : null);
    if (parcel && !['A', 'B', 'C'].includes(parcel)) err('Gabaryt Paczkomatu: A, B albo C.');
  }

  const specs = (Array.isArray(input.specs) ? input.specs : [])
    .map((s) => [str(s?.[0], 60), str(s?.[1], 200)]).filter(([k, v]) => k && v);
  if (specs.length > LIMITS.specs) err(`Specyfikacja: maksymalnie ${LIMITS.specs} pozycji.`);
  const badges = (Array.isArray(input.badges) ? input.badges : []).map((b) => str(b, 20)).filter(Boolean);
  if (badges.length > LIMITS.badges) err(`Etykiety: maksymalnie ${LIMITS.badges}.`);

  const images = (Array.isArray(input.images) ? input.images : []).map((im) => ({
    src: str(typeof im === 'string' ? im : im?.src, 600),
    alt: str(im?.alt, 160) || name,
    r2_key: str(im?.r2_key, 300)
  })).filter((im) => im.src);
  if (images.length > LIMITS.images) err(`Maksymalnie ${LIMITS.images} zdjęć na produkt.`);
  for (const im of images) if (!isImageSrc(im.src)) err(`Zdjęcie „${im.src.slice(0, 60)}” — podaj adres zaczynający się od https://.`);
  for (const im of images) if (im.r2_key && !/^products\/[\w.\-/]+$/.test(im.r2_key)) err('Nieprawidłowy klucz zdjęcia w R2.');

  const variantsIn = Array.isArray(input.variants) ? input.variants : [];
  if (!variantsIn.length) err('Dodaj co najmniej jeden wariant z ceną.');
  if (variantsIn.length > LIMITS.variants) err(`Maksymalnie ${LIMITS.variants} wariantów.`);
  const variants = variantsIn.map((v, i) => {
    const label = str(v?.label, 80) || (variantsIn.length === 1 ? 'Standard' : '');
    const sku = str(v?.sku, 40).toUpperCase();
    const price = intOrNull(v?.price_gr);
    const stock = intOrNull(v?.stock);
    const n = `Wariant ${i + 1}${label ? ` („${label}”)` : ''}`;
    if (!label) err(`${n}: podaj nazwę wariantu, np. „100 szt.” albo „M”.`);
    if (sku && !/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(sku)) err(`${n}: SKU może mieć litery, cyfry i myślniki (3–40 znaków).`);
    if (!(Number.isInteger(price) && price >= 100 && price <= 10_000_000)) err(`${n}: cena od 1 zł do 100 000 zł.`);
    if (stock !== null && !(Number.isInteger(stock) && stock >= 0 && stock <= 100000)) err(`${n}: stan to liczba od 0 albo puste pole (bez limitu).`);
    return { label, sku, price_gr: price, stock, active: v?.active !== false };
  });
  const skus = variants.map((v) => v.sku).filter(Boolean);
  if (new Set(skus).size !== skus.length) err('Dwa warianty mają ten sam SKU.');
  const labels = variants.map((v) => v.label.toLowerCase());
  if (new Set(labels).size !== labels.length) err('Dwa warianty mają tę samą nazwę.');

  const compare = intOrNull(input.compare_at_gr);
  const minPrice = Math.min(...variants.map((v) => v.price_gr).filter(Number.isInteger));
  if (compare !== null && !(compare > minPrice)) err('Cena przed obniżką musi być wyższa od najniższej ceny wariantu.');

  return {
    errors,
    value: errors.length ? null : {
      id: input.id ? Number(input.id) : null,
      slug, name, category, type,
      short: str(input.short, 300), description: str(input.description, 5000),
      vat_rate: vat, personalizable: !!input.personalizable,
      lead_time_days: lead, weight_g: weight, dims_cm: dims, shipping_class: shipping, parcel_size: parcel,
      specs, badges, images, compare_at_gr: compare, active: input.active !== false,
      variants
    }
  };
}

// Dane do porównań: wszystkie produkty i warianty jednym zapytaniem (import wielu produktów naraz)
export async function loadIndex(db) {
  const [{ results: products }, { results: variants }, { results: cats }, { results: maxIds }] = await db.batch([
    db.prepare('SELECT id, slug, art_shape, art_tone, gpsr_json FROM products'),
    db.prepare('SELECT id, product_id, sku, label, price_gr, stock, reserved FROM variants'),
    db.prepare('SELECT id, slug FROM categories ORDER BY sort'),
    db.prepare('SELECT (SELECT COALESCE(MAX(id), 0) FROM products) AS product')
  ]);
  return {
    bySlug: new Map(products.map((p) => [p.slug, p])),
    byId: new Map(products.map((p) => [p.id, p])),
    variants,
    skuOwner: new Map(variants.map((v) => [v.sku, v.product_id])),
    categories: new Map(cats.map((c) => [c.slug, c.id])),
    nextId: maxIds[0].product + 1
  };
}

// Co się stanie z produktem: nowy / aktualizacja. Sprawdza konflikty slug i SKU z innymi produktami.
export function plan(value, index) {
  const errors = [];
  let existing = value.id ? index.byId.get(value.id) : index.bySlug.get(value.slug);
  if (value.id && !existing) errors.push('Ten produkt już nie istnieje.');
  const other = index.bySlug.get(value.slug);
  if (existing && other && other.id !== existing.id) errors.push(`Adres „${value.slug}” ma już inny produkt.`);
  const productId = existing?.id ?? null;
  for (const v of value.variants) {
    const owner = v.sku && index.skuOwner.get(v.sku);
    if (owner && owner !== productId) errors.push(`SKU ${v.sku} należy do innego produktu.`);
  }
  if (existing) {
    const current = index.variants.filter((v) => v.product_id === existing.id);
    for (const v of value.variants) {
      const match = matchVariant(v, current);
      if (match && v.stock !== null && v.stock < match.reserved) {
        errors.push(`Wariant „${v.label}”: w nieopłaconych zamówieniach jest ${match.reserved} szt. — stan nie może być niższy.`);
      }
    }
  }
  return { action: existing ? 'aktualizacja' : 'nowy', existing, errors };
}

function matchVariant(v, current) {
  if (v.sku) return current.find((c) => c.sku === v.sku) ?? null;
  return current.find((c) => c.label.toLowerCase() === v.label.toLowerCase()) ?? null;
}

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

// Zapis jednego produktu (po plan() bez błędów). Wszystko w jednej transakcji.
export async function saveProduct(db, value, index) {
  const { existing } = plan(value, index);
  const ts = now();
  const id = existing?.id ?? index.nextId++;
  const categoryId = index.categories.get(value.category);
  const physical = value.type === 'physical';
  const [l, w, h] = value.dims_cm ?? [null, null, null];
  const stmts = [];

  const fields = {
    slug: value.slug, category_id: categoryId, name: value.name, type: value.type, short: value.short || null,
    description: value.description || null, vat_rate: value.vat_rate, personalizable: value.personalizable ? 1 : 0,
    lead_time_days: value.lead_time_days, weight_g: value.weight_g, length_cm: l, width_cm: w, height_cm: h,
    shipping_class: value.shipping_class, parcel_size: value.parcel_size,
    specs_json: JSON.stringify(value.specs), badges_json: JSON.stringify(value.badges),
    compare_at_gr: value.compare_at_gr, active: value.active ? 1 : 0, updated_at: ts,
    gpsr_json: physical ? (existing?.gpsr_json || JSON.stringify(GPSR)) : null
  };
  if (existing) {
    const keys = Object.keys(fields);
    stmts.push(db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).bind(...keys.map((k) => fields[k]), id));
  } else {
    fields.art_shape = ART_BY_CATEGORY[value.category] ?? 'card';
    fields.art_tone = ['magenta', 'cyan', 'yellow'][id % 3];
    const keys = ['id', ...Object.keys(fields)];
    stmts.push(db.prepare(`INSERT INTO products (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(id, ...Object.values(fields)));
  }

  // Warianty: dopasowanie po SKU (albo nazwie), nowe dostają SKU, brakujące są wyłączane — nie kasujemy ich,
  // bo mogą być w historii zamówień.
  const current = existing ? index.variants.filter((v) => v.product_id === id) : [];
  const kept = new Set();
  const usedSkus = new Set(index.skuOwner.keys());
  const prefix = `PK-${SKU_PREFIX[value.category] ?? 'PR'}${String(id).padStart(2, '0')}-`;
  let counter = current.length;
  value.variants.forEach((v, sort) => {
    const match = matchVariant(v, current);
    if (match) {
      kept.add(match.id);
      stmts.push(db.prepare('UPDATE variants SET label = ?, price_gr = ?, stock = ?, sort = ?, active = ? WHERE id = ?')
        .bind(v.label, v.price_gr, v.stock, sort, v.active ? 1 : 0, match.id));
      if (match.price_gr !== v.price_gr) {
        stmts.push(db.prepare('INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (?, ?, ?)').bind(match.id, v.price_gr, ts));
      }
      v.sku = match.sku;
    } else {
      let sku = v.sku;
      while (!sku || usedSkus.has(sku)) { counter += 1; sku = `${prefix}V${counter}`; }
      usedSkus.add(sku);
      v.sku = sku;
      stmts.push(db.prepare('INSERT INTO variants (product_id, sku, label, price_gr, stock, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, sku, v.label, v.price_gr, v.stock, sort, v.active ? 1 : 0));
      stmts.push(db.prepare('INSERT INTO price_history (variant_id, price_gr, valid_from) SELECT id, ?, ? FROM variants WHERE sku = ?').bind(v.price_gr, ts, sku));
    }
  });
  for (const c of current) if (!kept.has(c.id)) stmts.push(db.prepare('UPDATE variants SET active = 0 WHERE id = ?').bind(c.id));

  // Zdjęcia: zapisujemy pełną listę w podanej kolejności
  stmts.push(db.prepare('DELETE FROM product_images WHERE product_id = ?').bind(id));
  value.images.forEach((im, sort) => {
    stmts.push(db.prepare('INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (?, ?, ?, ?, ?)')
      .bind(id, im.r2_key || '', im.src, im.alt, sort));
  });

  await db.batch(stmts);

  // indeks w pamięci aktualny dla kolejnych produktów z tego samego importu
  const row = { id, slug: value.slug, gpsr_json: fields.gpsr_json };
  if (existing) index.bySlug.delete(existing.slug);
  index.bySlug.set(value.slug, row);
  index.byId.set(id, row);
  for (const v of value.variants) index.skuOwner.set(v.sku, id);
  return { id, slug: value.slug, action: existing ? 'aktualizacja' : 'nowy' };
}

// Pełne dane produktu do edycji i eksportu (także ukryte warianty)
export async function productsForAdmin(db, onlyId = null) {
  const where = onlyId ? 'WHERE p.id = ?' : '';
  const binds = onlyId ? [onlyId] : [];
  const [{ results: rows }, { results: variants }, { results: images }] = await db.batch([
    db.prepare(`SELECT p.*, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id ${where} ORDER BY c.sort, p.id`).bind(...binds),
    db.prepare(`SELECT * FROM variants ${onlyId ? 'WHERE product_id = ?' : ''} ORDER BY product_id, active DESC, sort`).bind(...binds),
    db.prepare(`SELECT * FROM product_images ${onlyId ? 'WHERE product_id = ?' : ''} ORDER BY product_id, sort, id`).bind(...binds)
  ]);
  const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, category: r.category_slug, type: r.type,
    short: r.short ?? '', description: r.description ?? '', vat_rate: r.vat_rate,
    personalizable: !!r.personalizable, lead_time_days: r.lead_time_days, weight_g: r.weight_g,
    dims_cm: r.length_cm ? [r.length_cm, r.width_cm, r.height_cm] : null,
    shipping_class: r.shipping_class, parcel_size: r.parcel_size,
    specs: parse(r.specs_json, []), badges: parse(r.badges_json, []), compare_at_gr: r.compare_at_gr,
    active: !!r.active, art: { shape: r.art_shape, tone: r.art_tone },
    images: images.filter((im) => im.product_id === r.id).map((im) => ({ src: im.src || `/api/images/${im.r2_key}`, alt: im.alt, r2_key: im.r2_key || '' })),
    variants: variants.filter((v) => v.product_id === r.id).map((v) => ({
      id: v.id, sku: v.sku, label: v.label, price_gr: v.price_gr, stock: v.stock, reserved: v.reserved, active: !!v.active
    }))
  }));
}
