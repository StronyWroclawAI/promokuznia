import { json, problem, readJson } from '../../../_lib/http.js';
import { resolveCart, cartView, loadVariant, availableQty, touchCart } from '../../../_lib/cart.js';

// POST /api/cart/items  { variant_id, qty, upload_id? }
export async function onRequestPost(context) {
  const { env } = context;
  const db = env.DB;
  const body = await readJson(context.request);
  if (!body) return problem(400, 'Nieprawidłowe dane żądania.');

  const variantId = Number(body.variant_id);
  const qty = Math.floor(Number(body.qty ?? 1));
  if (!Number.isInteger(variantId) || variantId <= 0) return problem(400, 'Wybierz wariant produktu.');
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) return problem(400, 'Ilość musi być od 1 do 99.');

  const variant = await loadVariant(db, variantId);
  if (!variant || !variant.active || !variant.product_active) return problem(404, 'Ten produkt nie jest już dostępny.');

  const cart = await resolveCart(context, { create: true });

  let uploadId = null;
  if (body.upload_id) {
    if (!variant.personalizable) return problem(400, 'Do tego produktu nie dołącza się pliku.');
    const up = await db.prepare('SELECT id FROM uploads WHERE id = ? AND cart_id = ?').bind(String(body.upload_id), cart.id).first();
    if (!up) return problem(400, 'Nie znaleziono wgranego pliku. Wgraj go ponownie.');
    uploadId = up.id;
  }

  const existing = await db.prepare(
    'SELECT id, qty FROM cart_items WHERE cart_id = ? AND variant_id = ? AND upload_id IS ?'
  ).bind(cart.id, variantId, uploadId).first();

  const limit = availableQty(variant);
  const wanted = (existing?.qty ?? 0) + qty;
  if (limit === 0) return problem(409, 'Ten wariant jest chwilowo niedostępny.');
  if (wanted > limit) return problem(409, `Możesz zamówić najwyżej ${limit} szt. tego wariantu.`, { max_qty: limit });

  await db.batch([
    existing
      ? db.prepare('UPDATE cart_items SET qty = ? WHERE id = ?').bind(wanted, existing.id)
      : db.prepare('INSERT INTO cart_items (cart_id, variant_id, qty, upload_id) VALUES (?, ?, ?, ?)').bind(cart.id, variantId, qty, uploadId),
    touchCart(db, cart.id)
  ]);

  return json({ cart: await cartView(db, cart) }, { status: 201 });
}
