import { json, problem, readJson, nowIso } from '../../_lib/http.js';
import { hashPassword } from '../../_lib/crypto.js';
import { normalizeEmail, isEmail, passwordProblem, signIn, publicCustomer } from '../../_lib/auth.js';

const CONSENT_TEXT = 'Chcę dostawać e-mailem informacje o nowościach i promocjach PromoKuźni. Zgodę mogę wycofać w każdej chwili.';

// POST /api/auth/register  { email, password, first_name?, marketing_consent? }
export async function onRequestPost(context) {
  const db = context.env.DB;
  const body = await readJson(context.request);
  if (!body) return problem(400, 'Nieprawidłowe dane żądania.');

  const email = normalizeEmail(body.email);
  if (!isEmail(email)) return problem(400, 'Podaj poprawny adres e-mail.', { field: 'email' });
  const pwProblem = passwordProblem(body.password);
  if (pwProblem) return problem(400, pwProblem, { field: 'password' });
  const firstName = String(body.first_name ?? '').trim().slice(0, 60) || null;
  const consent = body.marketing_consent === true;

  const existing = await db.prepare('SELECT id, password_hash FROM customers WHERE email = ?').bind(email).first();
  if (existing?.password_hash) {
    return problem(409, 'Konto z tym adresem już istnieje. Zaloguj się albo zresetuj hasło.', { field: 'email' });
  }

  const hash = await hashPassword(body.password);
  let customerId;
  if (existing) {
    // klient kupował wcześniej jako gość — zakładamy mu hasło na istniejącym rekordzie
    await db.prepare('UPDATE customers SET password_hash = ?, first_name = COALESCE(?, first_name) WHERE id = ?')
      .bind(hash, firstName, existing.id).run();
    customerId = existing.id;
  } else {
    const row = await db.prepare(
      `INSERT INTO customers (email, password_hash, first_name, marketing_consent, consent_at, consent_text)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`
    ).bind(email, hash, firstName, consent ? 1 : 0, consent ? nowIso() : null, consent ? CONSENT_TEXT : null).first();
    customerId = row.id;
  }

  await signIn(context, customerId);
  return json({ customer: publicCustomer({ email, first_name: firstName }) }, { status: 201 });
}
