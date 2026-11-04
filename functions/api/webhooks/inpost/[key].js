import { json, problem } from '../../../_lib/http.js';
import { syncShipment, } from '../../../_lib/shipping.js';
import { notifyOrder, later } from '../../../_lib/mail.js';

// Webhook InPost: https://<domena>/api/webhooks/inpost/<INPOST_WEBHOOK_KEY>
// Adres ustawiasz w Managerze Paczek: Moje konto → API → Ustawienia organizacji → Adres webhook.
// InPost nie podpisuje powiadomień, dlatego: (1) sekretny klucz w adresie, (2) treść traktujemy tylko jako
// „coś się zmieniło przy przesyłce X” i aktualny status pobieramy sami z API ShipX.
const same = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

// InPost sprawdza adres zapytaniem GET przed zapisaniem
export async function onRequestGet({ env, params }) {
  if (!same(String(params.key), String(env.INPOST_WEBHOOK_KEY ?? ''))) return problem(404, 'Nie znaleziono.');
  return json({ ok: true });
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  if (!same(String(params.key), String(env.INPOST_WEBHOOK_KEY ?? ''))) return problem(404, 'Nie znaleziono.');
  let body;
  try { body = await request.json(); } catch { return json({ ignored: true }); }
  const id = body?.payload?.shipment_id ?? body?.payload?.id;
  if (!id) return json({ ignored: true });

  const shipment = await env.DB.prepare(`SELECT * FROM shipments WHERE carrier = 'inpost' AND external_id = ?`).bind(String(id)).first();
  if (!shipment) return json({ ignored: true, unknown_shipment: true });
  try {
    const r = await syncShipment(env, shipment, 'webhook_przewoznika');
    const origin = new URL(request.url).origin;
    for (const [kind, extra] of r.mails) later(context, notifyOrder(env, origin, shipment.order_id, kind, extra));
    return json({ ok: true, status: r.status });
  } catch (err) {
    console.error('InPost webhook', err?.message ?? err);
    return json({ ok: false }, { status: 502 });   // InPost ponowi powiadomienie
  }
}
