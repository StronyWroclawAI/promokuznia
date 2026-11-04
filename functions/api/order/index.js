import { json, problem } from '../../_lib/http.js';
import { findOrderForViewer, orderView, releaseExpired } from '../../_lib/orders.js';

// GET /api/order?number=PK/2026/000001&t=<token z linku>
// Zalogowany właściciel nie potrzebuje tokenu.
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  await releaseExpired(context.env.DB, 5);
  const order = await findOrderForViewer(context, url.searchParams.get('number'), url.searchParams.get('t'));
  if (!order) return problem(404, 'Nie znaleziono zamówienia. Otwórz link z maila albo zaloguj się na konto, z którego je złożono.');
  return json({ order: await orderView(context, order) });
}
