import { problem } from '../../_lib/http.js';
import { p24VerifyNotification, p24ConfirmTransaction, recordEvent, markPaymentPaid } from '../../_lib/payments.js';

// POST /api/webhooks/przelewy24 — urlStatus podany przy rejestracji transakcji
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  let n;
  try { n = await request.json(); } catch { return problem(400, 'Niepoprawne dane.'); }
  if (!(await p24VerifyNotification(env, n))) return problem(400, 'Niepoprawny podpis.');

  const payment = await db.prepare(`SELECT * FROM payments WHERE provider = 'przelewy24' AND provider_ref = ?`).bind(String(n.sessionId)).first();
  if (!payment) return problem(404, 'Nieznana transakcja.');
  if (Number(n.amount) !== payment.amount_gr || n.currency !== 'PLN') return problem(400, 'Kwota się nie zgadza.');

  // potwierdzenie po naszej stronie — bez niego P24 nie przekaże środków
  if (!(await p24ConfirmTransaction(env, n))) return problem(502, 'Weryfikacja w Przelewy24 nie powiodła się.');
  if (await recordEvent(db, 'przelewy24', `${n.sessionId}:${n.orderId}`, n)) {
    await markPaymentPaid(db, payment, { amount_gr: Number(n.amount), provider_order: String(n.orderId), source_note: `Przelewy24 ${n.orderId}` });
  }
  return new Response('OK');
}
