// Generuje z seed/catalog.json:
//   seed/seed.sql             → wgrywany do D1 (wrangler d1 execute --file)
//   public/data/catalog.json  → ten sam katalog jako statyczny plik (tryb bez API / podgląd)
// Uruchom: node scripts/build-seed.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const src = JSON.parse(await readFile(new URL('seed/catalog.json', root), 'utf8'));

const DAY = 86400000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const SKU_PREFIX = {
  'druk-firmowy': 'DR', 'gadzety-z-logo': 'GD', 'systemy-wystawiennicze': 'SW',
  'produkty-cyfrowe': 'CY', 'uslugi': 'US', 'karty-podarunkowe': 'KP'
};

const GPSR = {
  name: 'PromoKuźnia (dane przykładowe — sklep demonstracyjny)',
  address: 'ul. Kowalska 12, 50-000 Wrocław',
  contact: 'bezpieczenstwo@promokuznia.pl'
};

const q = (v) => v === null || v === undefined ? 'NULL'
  : typeof v === 'number' ? String(v)
  : `'${String(v).replace(/'/g, "''")}'`;

// Omnibus: najniższa cena z 30 dni przed ostatnią obniżką
function lowestBefore(history) {
  if (!history || history.length < 2) return null;
  const sorted = [...history].sort((a, b) => b.days_ago - a.days_ago);
  const current = sorted.at(-1);
  const prev = sorted.at(-2);
  if (current.price_gr >= prev.price_gr) return null;
  const cutStart = current.days_ago + 30;
  const inWindow = sorted.filter((h, i) => {
    const next = sorted[i + 1];
    const endsAt = next ? next.days_ago : 0;
    return h !== current && endsAt < cutStart && h.days_ago > current.days_ago;
  });
  return Math.min(...inWindow.map((h) => h.price_gr));
}

const sql = ['-- Wygenerowano przez scripts/build-seed.mjs — nie edytuj ręcznie', 'PRAGMA foreign_keys = ON;', ''];
const out = { generated_at: iso(now), categories: [], products: [] };

src.categories.forEach((c, i) => {
  const id = i + 1;
  c.id = id;
  sql.push(`INSERT INTO categories (id, slug, name, lead, sort) VALUES (${id}, ${q(c.slug)}, ${q(c.name)}, ${q(c.lead)}, ${c.sort});`);
  out.categories.push({ id, slug: c.slug, name: c.name, lead: c.lead, sort: c.sort });
});
sql.push('');

const catBySlug = Object.fromEntries(src.categories.map((c) => [c.slug, c]));
let variantId = 0;

src.products.forEach((p, i) => {
  const id = i + 1;
  const cat = catBySlug[p.category];
  if (!cat) throw new Error(`Nieznana kategoria: ${p.category} (${p.slug})`);
  const [l, w, h] = p.dims_cm ?? [null, null, null];
  const gpsr = p.type === 'physical' ? GPSR : null;
  sql.push(
    `INSERT INTO products (id, slug, category_id, name, type, short, description, vat_rate, personalizable, lead_time_days, weight_g, length_cm, width_cm, height_cm, shipping_class, parcel_size, art_shape, art_tone, specs_json, badges_json, compare_at_gr, gpsr_json) VALUES (` +
    [id, p.slug, cat.id, p.name, p.type, p.short, p.description, p.vat, p.personalizable ? 1 : 0, p.lead_time_days,
      p.weight_g ?? null, l, w, h, p.shipping ?? null, p.parcel_size ?? null, p.art.shape, p.art.tone,
      JSON.stringify(p.specs), JSON.stringify(p.badges ?? []), p.compare_at_gr ?? null, gpsr ? JSON.stringify(gpsr) : null
    ].map(q).join(', ') + ');'
  );

  const variants = p.variants.map((v, vi) => {
    variantId += 1;
    const sku = `PK-${SKU_PREFIX[p.category]}${String(id).padStart(2, '0')}-${v.code}`;
    sql.push(`INSERT INTO variants (id, product_id, sku, label, price_gr, stock, sort) VALUES (${[variantId, id, sku, v.label, v.price_gr, v.stock, vi].map(q).join(', ')});`);
    return { id: variantId, sku, label: v.label, price_gr: v.price_gr, stock: v.stock, available: v.stock === null ? true : v.stock > 0 };
  });

  // Historia cen: dla produktów z promocją z catalog.json, dla reszty jeden wpis „od 60 dni”
  const history = p.price_history ?? [{ price_gr: p.variants[0].price_gr, days_ago: 60 }];
  for (const hrow of history) {
    sql.push(`INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (${variants[0].id}, ${hrow.price_gr}, ${q(iso(now - hrow.days_ago * DAY))});`);
  }

  const images = (p.images ?? []).map((im, ii) => {
    sql.push(`INSERT INTO product_images (product_id, r2_key, src, alt, sort) VALUES (${[id, '', im.src, im.alt, ii].map(q).join(', ')});`);
    return { src: im.src, alt: im.alt };
  });

  out.products.push({
    id, slug: p.slug, category: p.category, name: p.name, type: p.type, short: p.short,
    description: p.description, vat_rate: p.vat, personalizable: !!p.personalizable,
    lead_time_days: p.lead_time_days, weight_g: p.weight_g ?? null, dims_cm: p.dims_cm ?? null,
    shipping_class: p.shipping ?? null, parcel_size: p.parcel_size ?? null,
    art: p.art, images, specs: p.specs, badges: p.badges ?? [],
    compare_at_gr: p.compare_at_gr ?? null, lowest_30d_gr: lowestBefore(p.price_history),
    gpsr, variants,
    price_from_gr: Math.min(...variants.map((v) => v.price_gr))
  });
  sql.push('');
});

// Przykładowe kody rabatowe do testów koszyka (Etap 3)
sql.push(`INSERT INTO coupons (code, kind, value, min_total_gr, max_uses, valid_until) VALUES ('START10', 'procent', 10, 5000, 100, ${q(iso(now + 365 * DAY))});`);
sql.push(`INSERT INTO coupons (code, kind, value, min_total_gr, max_uses, valid_until) VALUES ('DOSTAWA0', 'darmowa_dostawa', 0, 10000, NULL, ${q(iso(now + 365 * DAY))});`);
sql.push('');

await writeFile(new URL('seed/seed.sql', root), sql.join('\n'));
await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/catalog.json', root), JSON.stringify(out, null, 2));

console.log(`Kategorie: ${out.categories.length}, produkty: ${out.products.length}, warianty: ${variantId}`);
