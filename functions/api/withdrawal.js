import { json, problem, readJson } from '../_lib/http.js';
import { normalizeEmail, isEmail } from '../_lib/auth.js';
import { rateLimit, clientIp, verifyTurnstile, turnstileFailed } from '../_lib/guard.js';
import { sendMail, TEMPLATES, later } from '../_lib/mail.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// POST /api/withdrawal  { number, email, items, account?, note?, cf_turnstile? }
// Oświadczenie o odstąpieniu od umowy: zapis przy zamówieniu, potwierdzenie dla klienta, powiadomienie dla sklepu.
export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await readJson(request);
  if (!body) return problem(400, 'Nieprawidłowe dane żądania.');
  const ip = clientIp(request);
  const blocked = await rateLimit(env, `withdrawal:ip:${ip}`, 5, 3600);
  if (blocked) return blocked;
  if (!(await verifyTurnstile(env, body.cf_turnstile, ip))) return turnstileFailed();

  const number = str(body.number, 20).toUpperCase().replace(/-/g, '/');
  const email = normalizeEmail(body.email);
  const items = str(body.items, 1000);
  if (!/^PK\/\d{4}\/\d{6}$/.test(number)) return problem(400, 'Podaj numer zamówienia w formacie PK/2026/000123.', { field: 'number' });
  if (!isEmail(email)) return problem(400, 'Podaj e-mail użyty przy zamówieniu.', { field: 'email' });
  if (items.length < 3) return problem(400, 'Napisz, od których produktów odstępujesz.', { field: 'items' });

  const order = await env.DB.prepare('SELECT id, number, email, status FROM orders WHERE number = ? AND lower(email) = ?').bind(number, email).first();
  // ta sama odpowiedź, gdy numer nie istnieje i gdy e-mail nie pasuje — nie zdradzamy cudzych zamówień
  if (!order) return problem(404, 'Nie znaleźliśmy zamówienia o tym numerze dla tego adresu e-mail.', { field: 'number' });
  if (order.status === 'anulowane' || order.status === 'czeka_na_platnosc') {
    return problem(409, 'To zamówienie nie zostało opłacone ani wysłane — nie ma od czego odstępować.');
  }

  const account = str(body.account, 40) || null;
  const note = str(body.note, 500) || null;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO withdrawals (order_id, email, items_text, account, note) VALUES (?, ?, ?, ?, ?)').bind(order.id, email, items, account, note),
    env.DB.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, ?, ?, 'klient', ?)`)
      .bind(order.id, order.status, order.status, `Odstąpienie od umowy: ${items}${account ? ` · konto do zwrotu ${account}` : ''}${note ? ` · ${note}` : ''}`)
  ]);

  const origin = new URL(request.url).origin;
  const data = { number, items, account, note, adminUrl: `${origin}/admin/#z-${order.id}` };
  const forClient = TEMPLATES.odstapienie_klient(data);
  later(context, sendMail(env, { to: email, ...forClient, kind: 'odstapienie', orderId: order.id }));
  for (const to of String(env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)) {
    later(context, sendMail(env, { to, ...TEMPLATES.odstapienie_sklep(data), kind: 'odstapienie_sklep', orderId: order.id }));
  }
  return json({ ok: true, message: `Przyjęliśmy oświadczenie dla zamówienia ${number}. Potwierdzenie wysłaliśmy na ${email}.` }, { status: 201 });
}
