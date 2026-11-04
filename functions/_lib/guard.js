// Ochrona formularzy: limity prób w D1 i (opcjonalnie) Cloudflare Turnstile.
import { nowIso, problem } from './http.js';

export const clientIp = (request) => request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'lokalnie';

// Licznik w jednym zapytaniu (UPSERT) — dwa równoległe żądania nie „przeskoczą” limitu.
// Zwraca null, gdy wolno, albo odpowiedź 429 z czasem do odblokowania.
export async function rateLimit(env, key, max, windowSec) {
  const now = nowIso();
  const reset = nowIso(windowSec * 1000);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
       reset_at = CASE WHEN reset_at <= ? THEN excluded.reset_at ELSE reset_at END
     RETURNING count, reset_at`
  ).bind(key, reset, now, now).first();
  if (row.count <= max) return null;
  const seconds = Math.max(1, Math.ceil((Date.parse(row.reset_at) - Date.now()) / 1000));
  const minutes = Math.ceil(seconds / 60);
  const res = problem(429, `Za dużo prób. Spróbuj ponownie za ${minutes} ${minutes === 1 ? 'minutę' : minutes < 5 ? 'minuty' : 'minut'}.`, { retry_after: seconds });
  res.headers.set('retry-after', String(seconds));
  return res;
}

// Kilka limitów naraz (np. na IP i na e-mail) — pierwszy przekroczony wygrywa
export async function rateLimits(env, rules) {
  for (const [key, max, windowSec] of rules) {
    const blocked = await rateLimit(env, key, max, windowSec);
    if (blocked) return blocked;
  }
  return null;
}

export const clearLimit = (env, key) => env.DB.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();

// Cloudflare Turnstile (darmowa „captcha” bez zagadek). Bez TURNSTILE_SECRET — wyłączone.
export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token), remoteip: ip })
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

export const turnstileFailed = () => problem(400, 'Potwierdź, że nie jesteś botem (pole weryfikacji nad przyciskiem), i spróbuj ponownie.', { field: 'cf_turnstile' });

// Sprzątanie starych liczników przy okazji (1 na ~50 żądań)
export async function sweepLimits(env) {
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at < ?').bind(nowIso()).run();
}
