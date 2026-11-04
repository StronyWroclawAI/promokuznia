import { json, problem, readJson } from '../../_lib/http.js';
import { resolveCart, cartView, findCoupon, touchCart } from '../../_lib/cart.js';

// POST /api/cart/coupon  { code }
export async function onRequestPost(context) {
  const db = context.env.DB;
  const body = await readJson(context.request);
  const code = String(body?.code ?? '').trim().toUpperCase().slice(0, 40);
  if (!code) return problem(400, 'Wpisz kod rabatowy.');
  const coupon = await findCoupon(db, code);
  if (!coupon) return problem(404, 'Nie znamy tego kodu albo już wygasł.');
  const cart = await resolveCart(context, { create: true });
  await db.batch([db.prepare('UPDATE carts SET coupon_code = ? WHERE id = ?').bind(coupon.code, cart.id), touchCart(db, cart.id)]);
  return json({ cart: await cartView(db, { ...cart, coupon_code: coupon.code }) });
}

// DELETE /api/cart/coupon
export async function onRequestDelete(context) {
  const db = context.env.DB;
  const cart = await resolveCart(context);
  if (cart) await db.prepare('UPDATE carts SET coupon_code = NULL WHERE id = ?').bind(cart.id).run();
  return json({ cart: await cartView(db, cart && { ...cart, coupon_code: null }) });
}
