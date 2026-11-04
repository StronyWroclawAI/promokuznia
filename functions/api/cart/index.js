import { json } from '../../_lib/http.js';
import { resolveCart, cartView } from '../../_lib/cart.js';

// GET /api/cart — koszyk z cenami i sumami policzonymi na serwerze
export async function onRequestGet(context) {
  const cart = await resolveCart(context);
  return json({ cart: await cartView(context.env.DB, cart) });
}
