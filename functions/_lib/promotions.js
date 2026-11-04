// Promocje cenowe na produkty: −X% na wszystkie warianty, do wybranej daty albo do odwołania.
// Promocja naprawdę zmienia ceny wariantów i zapisuje je w price_history — dzięki temu sklep sam liczy
// najniższą cenę z 30 dni przed obniżką (dyrektywa Omnibus). Ceny sprzed promocji trzymamy w base_prices_json
// i przywracamy po jej zakończeniu.

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const parse = (s) => { try { return JSON.parse(s) ?? {}; } catch { return {}; } };

export class PromoError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const promoPrice = (price, percent) => Math.max(100, Math.round((price * (100 - percent)) / 100));

// Kończy promocje, którym minął termin. Tanie zapytanie — wołane przy każdym żądaniu API.
export async function sweepPromotions(db) {
  const { results } = await db.prepare(
    'SELECT id FROM promotions WHERE ended_at IS NULL AND ends_at IS NOT NULL AND ends_at <= ?'
  ).bind(now()).all();
  for (const r of results) await endPromotion(db, r.id).catch((e) => console.error('promo sweep', r.id, e?.message));
  return results.length;
}

export async function startPromotion(db, { product_id, percent, ends_at = null, label = null }) {
  const pct = Math.round(Number(percent));
  if (!(pct >= 1 && pct <= 90)) throw new PromoError(400, 'Rabat musi wynosić od 1 do 90%.');
  if (ends_at) {
    const t = Date.parse(ends_at);
    if (!Number.isFinite(t) || t <= Date.now()) throw new PromoError(400, 'Data końca promocji musi być w przyszłości.');
    ends_at = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  const product = await db.prepare('SELECT id, name, compare_at_gr FROM products WHERE id = ?').bind(Number(product_id)).first();
  if (!product) throw new PromoError(404, 'Nie ma takiego produktu.');
  const open = await db.prepare('SELECT id FROM promotions WHERE product_id = ? AND ended_at IS NULL').bind(product.id).first();
  if (open) throw new PromoError(409, 'Ten produkt ma już trwającą promocję. Zakończ ją, zanim ustawisz nową.');
  const { results: variants } = await db.prepare('SELECT id, price_gr, sort FROM variants WHERE product_id = ? AND active = 1 ORDER BY sort').bind(product.id).all();
  if (!variants.length) throw new PromoError(409, 'Produkt nie ma aktywnych wariantów.');

  const ts = now();
  const base = Object.fromEntries(variants.map((v) => [v.id, v.price_gr]));
  const cheapest = variants.reduce((a, b) => (b.price_gr < a.price_gr ? b : a));
  const before = new Date(Date.parse(ts) - 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const stmts = variants.flatMap((v) => {
    const price = promoPrice(v.price_gr, pct);
    return [
      // wariant bez historii cen dostaje wpis z ceną sprzed promocji — potrzebny do ceny z 30 dni (Omnibus)
      db.prepare('INSERT INTO price_history (variant_id, price_gr, valid_from) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM price_history WHERE variant_id = ?)').bind(v.id, v.price_gr, before, v.id),
      db.prepare('UPDATE variants SET price_gr = ? WHERE id = ?').bind(price, v.id),
      db.prepare('INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (?, ?, ?)').bind(v.id, price, ts)
    ];
  });
  stmts.push(
    db.prepare('UPDATE products SET compare_at_gr = ?, updated_at = ? WHERE id = ?').bind(cheapest.price_gr, ts, product.id),
    db.prepare('INSERT INTO promotions (product_id, percent, label, ends_at, base_prices_json, prev_compare_at_gr, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(product.id, pct, label ? String(label).slice(0, 40) : null, ends_at, JSON.stringify(base), product.compare_at_gr, ts)
  );
  await db.batch(stmts);
  return { product: product.name, percent: pct };
}

export async function endPromotion(db, id) {
  const promo = await db.prepare('SELECT * FROM promotions WHERE id = ? AND ended_at IS NULL').bind(Number(id)).first();
  if (!promo) throw new PromoError(404, 'Ta promocja już się zakończyła.');
  const base = parse(promo.base_prices_json);
  const ts = now();
  const stmts = [];
  for (const [variantId, price] of Object.entries(base)) {
    stmts.push(db.prepare('UPDATE variants SET price_gr = ? WHERE id = ?').bind(price, Number(variantId)));
    stmts.push(db.prepare('INSERT INTO price_history (variant_id, price_gr, valid_from) SELECT id, ?, ? FROM variants WHERE id = ?').bind(price, ts, Number(variantId)));
  }
  stmts.push(
    db.prepare('UPDATE products SET compare_at_gr = ?, updated_at = ? WHERE id = ?').bind(promo.prev_compare_at_gr, ts, promo.product_id),
    db.prepare('UPDATE promotions SET ended_at = ? WHERE id = ? AND ended_at IS NULL').bind(ts, promo.id)
  );
  await db.batch(stmts);
  return promo;
}

// Trwające promocje: product_id → { id, percent, label, ends_at, base: { variantId: cena } }
export async function openPromotions(db) {
  const { results } = await db.prepare('SELECT * FROM promotions WHERE ended_at IS NULL').all();
  return new Map(results.map((p) => [p.product_id, { id: p.id, percent: p.percent, label: p.label, ends_at: p.ends_at, base: parse(p.base_prices_json) }]));
}
