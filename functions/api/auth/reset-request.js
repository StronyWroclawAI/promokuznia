import { json, problem, readJson, nowIso } from '../../_lib/http.js';
import { randomToken, sha256 } from '../../_lib/crypto.js';
import { normalizeEmail, isEmail } from '../../_lib/auth.js';
import { sendMail, TEMPLATES, later } from '../../_lib/mail.js';
import { rateLimits, clientIp, verifyTurnstile, turnstileFailed } from '../../_lib/guard.js';

// POST /api/auth/reset-request  { email }
// Zawsze ta sama odpowiedź — nie zdradzamy, czy konto istnieje.
// Link idzie mailem przez Resend. Lokalnie, przy EXPOSE_RESET_LINKS=1 w .dev.vars,
// wraca też w odpowiedzi API (nigdy nie ustawiaj tego na produkcji).
export async function onRequestPost(context) {
  const { env, request } = context;
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  if (!isEmail(email)) return problem(400, 'Podaj poprawny adres e-mail.', { field: 'email' });
  const ip = clientIp(request);
  const blocked = await rateLimits(env, [[`reset:ip:${ip}`, 10, 3600], [`reset:email:${email}`, 3, 3600]]);
  if (blocked) return blocked;
  if (!(await verifyTurnstile(env, body.cf_turnstile, ip))) return turnstileFailed();

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
    const t = TEMPLATES.reset_hasla(null, { link });
    later(context, sendMail(env, { to: email, ...t, kind: 'reset_hasla' }));
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
