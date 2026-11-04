import { json, problem } from '../../_lib/http.js';
import { verifyStripeSignature, recordEvent, markPaymentPaid, markPaymentFailed } from '../../_lib/payments.js';
import { releaseExpired } from '../../_lib/orders.js';

// POST /api/webhooks/stripe
// W panelu Stripe: Developers → Webhooks → endpoint https://<domena>/api/webhooks/stripe, zdarzenia:
// checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.async_payment_failed, checkout.session.expired
// Lokalnie: stripe listen --forward-to localhost:8788/api/webhooks/stripe
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  const raw = await request.text();
  if (!(await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return problem(400, 'Niepoprawny podpis.');
  }
  const event = JSON.parse(raw);
  if (!(await recordEvent(db, 'stripe', event.id, event))) return json({ received: true, duplicate: true });

  const session = event.data?.object;
  if (session?.object !== 'checkout.session') return json({ received: true, ignored: event.type });

  const payment = await db.prepare(`SELECT * FROM payments WHERE provider = 'stripe' AND provider_ref = ?`).bind(session.id).first();
  if (!payment) return json({ received: true, unknown_session: true });

  const paid = (event.type === 'checkout.session.completed' && session.payment_status === 'paid')
    || event.type === 'checkout.session.async_payment_succeeded';

  if (paid) {
    if (session.currency !== 'pln') return problem(400, 'Nieoczekiwana waluta.');
    await markPaymentPaid(db, payment, {
      amount_gr: session.amount_total,
      provider_order: session.payment_intent,
      source_note: `Stripe ${session.payment_intent ?? session.id}`
    });
  } else if (event.type === 'checkout.session.async_payment_failed') {
    await markPaymentFailed(db, payment, 'Płatność odrzucona przez bank. Klient może spróbować ponownie.');
  } else if (event.type === 'checkout.session.expired') {
    await markPaymentFailed(db, payment, 'Sesja płatności wygasła bez wpłaty.');
    await releaseExpired(db);
  }
  // checkout.session.completed z payment_status 'unpaid' = metoda asynchroniczna, czekamy na kolejne zdarzenie
  return json({ received: true });
}
