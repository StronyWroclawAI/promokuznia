import { json, problem, readJson, nowIso } from '../../_lib/http.js';
import { hashPassword, sha256 } from '../../_lib/crypto.js';
import { passwordProblem, signIn } from '../../_lib/auth.js';

// POST /api/auth/reset  { token, password }
export async function onRequestPost(context) {
  const db = context.env.DB;
  const body = await readJson(context.request);
  if (!body?.token) return problem(400, 'Brakuje kodu z linku. Otwórz link z maila jeszcze raz.');
  const pwProblem = passwordProblem(body.password);
  if (pwProblem) return problem(400, pwProblem, { field: 'password' });

  const hash = await sha256(String(body.token));
  const reset = await db.prepare(
    'SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?'
  ).bind(hash, nowIso()).first();
  if (!reset) return problem(400, 'Link wygasł albo został już użyty. Poproś o nowy.');

  await db.batch([
    db.prepare('UPDATE customers SET password_hash = ? WHERE id = ?').bind(await hashPassword(body.password), reset.customer_id),
    db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(nowIso(), hash),
    // nowe hasło wylogowuje wszystkie inne urządzenia
    db.prepare('DELETE FROM sessions WHERE customer_id = ?').bind(reset.customer_id)
  ]);
  await signIn(context, reset.customer_id);
  return json({ ok: true });
}
