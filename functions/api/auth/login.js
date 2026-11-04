import { json, problem, readJson } from '../../_lib/http.js';
import { verifyPassword, DUMMY_HASH } from '../../_lib/crypto.js';
import { normalizeEmail, signIn, publicCustomer } from '../../_lib/auth.js';

// POST /api/auth/login  { email, password }
// Limit prób logowania (Turnstile + licznik w KV) dochodzi w Etapie 7.
export async function onRequestPost(context) {
  const db = context.env.DB;
  const body = await readJson(context.request);
  if (!body) return problem(400, 'Nieprawidłowe dane żądania.');

  const email = normalizeEmail(body.email);
  const customer = await db.prepare('SELECT id, email, first_name, last_name, password_hash FROM customers WHERE email = ?')
    .bind(email).first();
  // liczymy hash zawsze, żeby czas odpowiedzi nie zdradzał, czy konto istnieje
  const ok = await verifyPassword(String(body.password ?? ''), customer?.password_hash ?? DUMMY_HASH);
  if (!customer?.password_hash || !ok) return problem(401, 'Nieprawidłowy e-mail lub hasło.');

  await signIn(context, customer.id);
  return json({ customer: publicCustomer(customer) });
}
