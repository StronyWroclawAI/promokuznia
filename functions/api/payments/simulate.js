import { json, problem, readJson } from '../../_lib/http.js';
import { recordEvent, markPaymentPaid, markPaymentFailed, orderUrl } from '../../_lib/payments.js';
import { notifyOrder, later } from '../../_lib/mail.js';

// Bramka testowa dla wersji demo bez kluczy Stripe/P24. Przechodzi tę samą ścieżkę co prawdziwy webhook.
// GET  /api/payments/simulate?ref=sim_...  — dane do ekranu bramki
// POST /api/payments/simulate  { ref, outcome: 'paid' | 'failed', t? }
async function load(env, ref) {
  if (env.SHOP_MODE !== 'demo') return null;
  return env.DB.prepare(
    `SELECT p.*, o.number, o.email, o.payment_method FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.provider = 'symulator' AND p.provider_ref = ?`
  ).bind(String(ref ?? '')).first();
}

export async function onRequestGet({ env, request }) {
  const p = await load(env, new URL(request.url).searchParams.get('ref'));
  if (!p) return problem(404, 'Ta płatność testowa nie istnieje albo wygasła.');
  return json({ payment: { number: p.number, amount_gr: p.amount_gr, status: p.status, method: p.payment_method, email: p.email } });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await readJson(request);
  const p = await load(env, body?.ref);
  if (!p) return problem(404, 'Ta płatność testowa nie istnieje albo wygasła.');
  if (p.status !== 'utworzona') return problem(409, 'Ta płatność została już rozliczona.');

  if (await recordEvent(env.DB, 'symulator', `${p.provider_ref}:${body.outcome}`, { ref: p.provider_ref, outcome: body.outcome })) {
    if (body.outcome === 'paid') {
      const r = await markPaymentPaid(env.DB, p, { amount_gr: p.amount_gr, provider_order: p.provider_ref, source_note: 'Bramka testowa (tryb demo)' });
      if (r.finalized) later(context, notifyOrder(env, new URL(request.url).origin, p.order_id, 'oplacone'));
    } else {
      await markPaymentFailed(env.DB, p, 'Płatność testowa odrzucona.');
    }
  }
  return json({ redirect_url: orderUrl(new URL(request.url).origin, p.number, body.t || null) });
}
