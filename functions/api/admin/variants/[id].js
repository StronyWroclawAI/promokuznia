import { json, problem, readJson, nowIso } from '../../../_lib/http.js';

// PATCH /api/admin/variants/:id  { price_gr?, stock?, active? }
// Zmiana ceny trafia do price_history — z niej liczymy najniższą cenę z 30 dni (Omnibus).
export async function onRequestPatch({ env, params, request }) {
  const db = env.DB;
  const body = await readJson(request);
  if (!body) return problem(400, 'Nieprawidłowe dane.');
  const v = await db.prepare('SELECT * FROM variants WHERE id = ?').bind(Number(params.id)).first();
  if (!v) return problem(404, 'Nie ma takiego wariantu.');

  const stmts = [];
  if ('price_gr' in body) {
    const price = Math.round(Number(body.price_gr));
    if (!Number.isInteger(price) || price < 100 || price > 10_000_000) return problem(400, 'Cena musi być od 1 zł do 100 000 zł.');
    if (price !== v.price_gr) {
      stmts.push(db.prepare('UPDATE variants SET price_gr = ? WHERE id = ?').bind(price, v.id));
      stmts.push(db.prepare('INSERT INTO price_history (variant_id, price_gr, valid_from) VALUES (?, ?, ?)').bind(v.id, price, nowIso()));
    }
  }
  if ('stock' in body && v.stock !== null) {
    const stock = Math.round(Number(body.stock));
    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return problem(400, 'Stan musi być liczbą od 0.');
    if (stock < v.reserved) return problem(409, `W nieopłaconych zamówieniach jest zarezerwowane ${v.reserved} szt. Stan nie może być niższy.`);
    stmts.push(db.prepare('UPDATE variants SET stock = ? WHERE id = ?').bind(stock, v.id));
  }
  if ('active' in body) stmts.push(db.prepare('UPDATE variants SET active = ? WHERE id = ?').bind(body.active ? 1 : 0, v.id));
  if (!stmts.length) return json({ variant: v, message: 'Bez zmian.' });

  await db.batch([...stmts, db.prepare('UPDATE products SET updated_at = ? WHERE id = ?').bind(nowIso(), v.product_id)]);
  const fresh = await db.prepare('SELECT id, sku, label, price_gr, stock, reserved, active FROM variants WHERE id = ?').bind(v.id).first();
  return json({ variant: { ...fresh, active: !!fresh.active }, message: 'Zapisano.' });
}
