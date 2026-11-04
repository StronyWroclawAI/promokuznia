import { json, problem, readJson } from '../../../_lib/http.js';
import { resolveCart, cartView, loadVariant, availableQty, touchCart } from '../../../_lib/cart.js';

async function ownLine(context) {
  const cart = await resolveCart(context);
  if (!cart) return { cart: null, line: null };
  const line = await context.env.DB.prepare('SELECT * FROM cart_items WHERE id = ? AND cart_id = ?')
    .bind(Number(context.params.id), cart.id).first();
  return { cart, line };
}

// PATCH /api/cart/items/:id  { qty?, upload_id? (null = odłącz plik) }
export async function onRequestPatch(context) {
  const db = context.env.DB;
  const body = await readJson(context.request);
  if (!body) return problem(400, 'Nieprawidłowe dane żądania.');
  const { cart, line } = await ownLine(context);
  if (!line) return problem(404, 'Tej pozycji nie ma już w koszyku.');

  const stmts = [];
  if ('qty' in body) {
    const qty = Math.floor(Number(body.qty));
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) return problem(400, 'Ilość musi być od 1 do 99.');
    const variant = await loadVariant(db, line.variant_id);
    const limit = availableQty(variant);
    if (qty > limit) return problem(409, `Możesz zamówić najwyżej ${limit} szt. tego wariantu.`, { max_qty: limit });
    stmts.push(db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').bind(qty, line.id));
  }
  if ('upload_id' in body) {
    let uploadId = null;
    if (body.upload_id) {
      const up = await db.prepare('SELECT id FROM uploads WHERE id = ? AND cart_id = ?').bind(String(body.upload_id), cart.id).first();
      if (!up) return problem(400, 'Nie znaleziono wgranego pliku. Wgraj go ponownie.');
      uploadId = up.id;
    }
    stmts.push(db.prepare('UPDATE cart_items SET upload_id = ? WHERE id = ?').bind(uploadId, line.id));
  }
  if (!stmts.length) return problem(400, 'Nie podano, co zmienić.');
  stmts.push(touchCart(db, cart.id));
  await db.batch(stmts);
  return json({ cart: await cartView(db, cart) });
}

// DELETE /api/cart/items/:id
export async function onRequestDelete(context) {
  const db = context.env.DB;
  const { cart, line } = await ownLine(context);
  if (!line) return problem(404, 'Tej pozycji nie ma już w koszyku.');
  await db.batch([db.prepare('DELETE FROM cart_items WHERE id = ?').bind(line.id), touchCart(db, cart.id)]);
  return json({ cart: await cartView(db, cart) });
}
