// Wspólne dla /api/*: ochrona przed CSRF, odczyt sesji, dopisywanie ciasteczek, obsługa błędów.
import { json, problem, nowIso } from '../_lib/http.js';
import { parseCookies, SESSION_COOKIE, clearCookie } from '../_lib/cookies.js';
import { sha256 } from '../_lib/crypto.js';
import { sweepPromotions } from '../_lib/promotions.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function onRequest(context) {
  const { request, env, data } = context;
  data.setCookies = [];
  data.cookies = parseCookies(request);

  // Zmieniające żądania muszą przyjść z naszej strony (nagłówek Origin = nasz host)
  if (!SAFE.has(request.method)) {
    const origin = request.headers.get('origin');
    const host = new URL(request.url).host;
    if (origin && new URL(origin).host !== host) return problem(403, 'Żądanie z obcej strony zostało zablokowane.');
    if (!origin && request.headers.get('sec-fetch-site') === 'cross-site') return problem(403, 'Żądanie z obcej strony zostało zablokowane.');
  }

  // Zalogowany klient
  data.customer = null;
  const token = data.cookies[SESSION_COOKIE];
  if (token) {
    const row = await env.DB.prepare(
      `SELECT c.id, c.email, c.first_name, c.last_name, s.id AS session_id
         FROM sessions s JOIN customers c ON c.id = s.customer_id
        WHERE s.id = ? AND s.expires_at > ?`
    ).bind(await sha256(token), nowIso()).first();
    if (row) data.customer = row;
    else data.setCookies.push(clearCookie(SESSION_COOKIE));
  }

  let response;
  try {
    // promocje z minionym terminem wracają do starych cen (jedno lekkie zapytanie)
    await sweepPromotions(env.DB).catch(() => 0);
    response = await context.next();
  } catch (err) {
    console.error('API error', request.method, new URL(request.url).pathname, err?.stack ?? err);
    response = json({ error: 'Coś poszło nie tak po naszej stronie. Spróbuj ponownie za chwilę.' }, { status: 500 });
  }

  if (data.setCookies.length) {
    response = new Response(response.body, response);
    for (const c of data.setCookies) response.headers.append('set-cookie', c);
  }
  response.headers.set('x-content-type-options', 'nosniff');
  return response;
}
