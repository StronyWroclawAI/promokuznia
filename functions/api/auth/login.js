import { json, problem, readJson } from '../../_lib/http.js';
import { verifyPassword, DUMMY_HASH } from '../../_lib/crypto.js';
import { normalizeEmail, signIn, publicCustomer } from '../../_lib/auth.js';
import { rateLimits, clearLimit, clientIp, sweepLimits } from '../../_lib/guard.js';

// POST /api/auth/login  { email, password }
// Limit: 10 prób na 15 min dla jednego konta i 30 z jednego adresu IP. Udane logowanie zeruje licznik konta.
export async function onRequestPost(context) {
  const db = context.env.DB;
  const body = await readJson(context.request);
  if (!body) return problem(400, 'Nieprawidłowe dane żądania.');

  const email = normalizeEmail(body.email);
  const ip = clientIp(context.request);
  const blocked = await rateLimits(context.env, [[`login:ip:${ip}`, 30, 900], [`login:email:${email}`, 10, 900]]);
  if (blocked) return blocked;
  await sweepLimits(context.env);
  const customer = await db.prepare('SELECT id, email, first_name, last_name, password_hash FROM customers WHERE email = ?')
    .bind(email).first();
  // liczymy hash zawsze, żeby czas odpowiedzi nie zdradzał, czy konto istnieje
  const ok = await verifyPassword(String(body.password ?? ''), customer?.password_hash ?? DUMMY_HASH);
  if (!customer?.password_hash || !ok) return problem(401, 'Nieprawidłowy e-mail lub hasło.');

  await clearLimit(context.env, `login:email:${email}`);
  await signIn(context, customer.id);
  return json({ customer: publicCustomer(customer) });
}
