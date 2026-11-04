// Odczyt katalogu z D1 i zamiana wierszy na obiekty API.
// Kształt odpowiedzi jest identyczny z public/data/catalog.json (tryb bez API).

const DAY = 86400000;

const parse = (s, fallback) => {
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};

function toProduct(row, variants, lowest30) {
  const dims = row.length_cm ? [row.length_cm, row.width_cm, row.height_cm] : null;
  return {
    id: row.id,
    slug: row.slug,
    category: row.category_slug,
    name: row.name,
    type: row.type,
    short: row.short,
    description: row.description,
    vat_rate: row.vat_rate,
    personalizable: !!row.personalizable,
    lead_time_days: row.lead_time_days,
    weight_g: row.weight_g,
    dims_cm: dims,
    shipping_class: row.shipping_class,
    parcel_size: row.parcel_size,
    art: { shape: row.art_shape, tone: row.art_tone },
    specs: parse(row.specs_json, []),
    badges: parse(row.badges_json, []),
    compare_at_gr: row.compare_at_gr,
    lowest_30d_gr: lowest30 ?? null,
    gpsr: parse(row.gpsr_json, null),
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      label: v.label,
      price_gr: v.price_gr,
      stock: v.stock === null ? null : v.stock - v.reserved,
      available: v.stock === null || v.stock - v.reserved > 0
    })),
    price_from_gr: variants.length ? Math.min(...variants.map((v) => v.price_gr)) : null
  };
}

// Dyrektywa Omnibus: najniższa cena z 30 dni przed ostatnią obniżką
export function lowestBeforeReduction(history) {
  if (history.length < 2) return null;
  const rows = [...history].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  const current = rows.at(-1);
  const prev = rows.at(-2);
  if (current.price_gr >= prev.price_gr) return null;
  const reducedAt = Date.parse(current.valid_from);
  const windowStart = reducedAt - 30 * DAY;
  const prices = rows.slice(0, -1).filter((r, i, arr) => {
    const endsAt = i + 1 < arr.length ? Date.parse(arr.at(i + 1).valid_from) : reducedAt;
    return endsAt > windowStart;
  }).map((r) => r.price_gr);
  return prices.length ? Math.min(...prices) : null;
}

const PRODUCT_COLUMNS = `p.*, c.slug AS category_slug`;

export async function listCategories(db) {
  const { results } = await db.prepare(
    `SELECT c.id, c.slug, c.name, c.lead, c.sort,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count
       FROM categories c ORDER BY c.sort`
  ).all();
  return results;
}

const SORTS = {
  'polecane': 'p.id',
  'cena-rosnaco': 'price_from ASC',
  'cena-malejaco': 'price_from DESC',
  'nazwa': 'p.name COLLATE NOCASE'
};

export async function listProducts(db, { category, q, type, sort = 'polecane', limit = 60 } = {}) {
  const where = ['p.active = 1'];
  const binds = [];
  if (category) { where.push('c.slug = ?'); binds.push(category); }
  if (type) { where.push('p.type = ?'); binds.push(type); }
  if (q) {
    where.push('(p.name LIKE ? OR p.short LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  const order = SORTS[sort] ?? SORTS.polecane;
  const { results: rows } = await db.prepare(
    `SELECT ${PRODUCT_COLUMNS},
            (SELECT MIN(price_gr) FROM variants v WHERE v.product_id = p.id AND v.active = 1) AS price_from
       FROM products p JOIN categories c ON c.id = p.category_id
      WHERE ${where.join(' AND ')}
      ORDER BY ${order}
      LIMIT ?`
  ).bind(...binds, Math.min(Number(limit) || 60, 100)).all();

  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const [{ results: variants }, { results: history }] = await db.batch([
    db.prepare(`SELECT * FROM variants WHERE active = 1 AND product_id IN (${marks}) ORDER BY product_id, sort`).bind(...ids),
    db.prepare(
      `SELECT v.product_id, h.price_gr, h.valid_from
         FROM price_history h JOIN variants v ON v.id = h.variant_id
        WHERE v.product_id IN (${marks}) AND v.sort = 0`
    ).bind(...ids)
  ]);

  return rows.map((row) => toProduct(
    row,
    variants.filter((v) => v.product_id === row.id),
    row.compare_at_gr ? lowestBeforeReduction(history.filter((h) => h.product_id === row.id)) : null
  ));
}

export async function getProduct(db, slug) {
  const row = await db.prepare(
    `SELECT ${PRODUCT_COLUMNS} FROM products p JOIN categories c ON c.id = p.category_id
      WHERE p.slug = ? AND p.active = 1`
  ).bind(slug).first();
  if (!row) return null;
  const [{ results: variants }, { results: history }] = await db.batch([
    db.prepare('SELECT * FROM variants WHERE product_id = ? AND active = 1 ORDER BY sort').bind(row.id),
    db.prepare(
      `SELECT h.price_gr, h.valid_from FROM price_history h JOIN variants v ON v.id = h.variant_id
        WHERE v.product_id = ? AND v.sort = 0`
    ).bind(row.id)
  ]);
  return toProduct(row, variants, row.compare_at_gr ? lowestBeforeReduction(history) : null);
}
