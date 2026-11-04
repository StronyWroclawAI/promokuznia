import { json, problem, readJson } from '../../_lib/http.js';
import { findOrderForViewer, releaseExpired } from '../../_lib/orders.js';
import { startPayment } from '../../_lib/payments.js';

// POST /api/order/pay  { number, t } — kolejna próba płatności online dla nieopłaconego zamówienia
export async function onRequestPost(context) {
  const db = context.env.DB;
  const body = await readJson(context.request);
  await releaseExpired(db, 5);
  const order = await findOrderForViewer(context, body?.number, body?.t);
  if (!order) return problem(404, 'Nie znaleziono zamówienia.');
  if (order.status !== 'czeka_na_platnosc') return problem(409, 'To zamówienie nie czeka już na płatność.');
  if (order.payment_method !== 'stripe' && order.payment_method !== 'przelewy24') {
    return problem(400, 'To zamówienie opłacasz przelewem lub przy odbiorze.');
  }
  try {
    const pay = await startPayment(context, order, body?.t);
    return json({ redirect_url: pay.redirect_url });
  } catch (err) {
    console.error('retry payment', err?.message ?? err);
    return problem(502, 'Bramka płatności nie odpowiada. Spróbuj ponownie za chwilę.');
  }
}
