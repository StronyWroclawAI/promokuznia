import { json, problem, readJson, nowIso } from '../../_lib/http.js';
import { randomToken, sha256 } from '../../_lib/crypto.js';
import { normalizeEmail, isEmail } from '../../_lib/auth.js';

// POST /api/auth/reset-request  { email }
// Zawsze ta sama odpowiedź — nie zdradzamy, czy konto istnieje.
// Mail z linkiem wyśle Resend w Etapie 6. Do tego czasu, przy EXPOSE_RESET_LINKS=1 w .dev.vars,
// link wraca w odpowiedzi i trafia do logu (tylko lokalnie).
export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) return problem(400, 'Podaj poprawny adres e-mail.', { field: 'email' });

  const customer = await env.DB.prepare('SELECT id FROM customers WHERE email = ? AND password_hash IS NOT NULL').bind(email).first();
  let devLink = null;
  if (customer) {
    const token = randomToken();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM password_resets WHERE customer_id = ?').bind(customer.id),
      env.DB.prepare('INSERT INTO password_resets (token_hash, customer_id, expires_at) VALUES (?, ?, ?)')
        .bind(await sha256(token), customer.id, nowIso(60 * 60 * 1000))
    ]);
    const link = `${new URL(request.url).origin}/?reset=${token}#nowe-haslo`;
    if (env.EXPOSE_RESET_LINKS === '1') {
      console.log('Link do resetu hasła:', link);
      devLink = link;
    }
  }
  return json({
    ok: true,
    message: 'Jeśli konto z tym adresem istnieje, wysłaliśmy link do ustawienia nowego hasła. Link jest ważny 60 minut.',
    ...(devLink ? { dev_link: devLink } : {})
  });
}
