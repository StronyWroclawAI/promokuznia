import { json, problem, readJson } from '../../../_lib/http.js';
import { normalizeCoupon } from '../../../_lib/coupons.js';

// PATCH /api/admin/coupons/:id — edycja albo samo włączenie/wyłączenie ({ active })
export async function onRequestPatch({ env, params, request }) {
  const db = env.DB;
  const current = await db.prepare('SELECT * FROM coupons WHERE id = ?').bind(Number(params.id)).first();
  if (!current) return problem(404, 'Nie ma takiego kodu.');
  const body = await readJson(request);
  if (!body) return problem(400, 'Nieprawidłowe dane.');
  const { value, errors } = normalizeCoupon({ ...current, active: !!current.active, ...body, code: current.code });
  if (errors.length) return problem(422, errors[0], { errors });
  const row = await db.prepare(
    'UPDATE coupons SET kind = ?, value = ?, min_total_gr = ?, max_uses = ?, valid_until = ?, active = ? WHERE id = ? RETURNING *'
  ).bind(value.kind, value.value, value.min_total_gr, value.max_uses, value.valid_until, value.active ? 1 : 0, current.id).first();
  return json({ coupon: { ...row, active: !!row.active }, message: 'Zapisano.' });
}

// DELETE /api/admin/coupons/:id — tylko kod jeszcze nieużyty; użyty można wyłączyć
export async function onRequestDelete({ env, params }) {
  const c = await env.DB.prepare('SELECT * FROM coupons WHERE id = ?').bind(Number(params.id)).first();
  if (!c) return problem(404, 'Nie ma takiego kodu.');
  if (c.used > 0) return problem(409, 'Kod był już użyty w zamówieniach — wyłącz go zamiast usuwać.');
  await env.DB.prepare('DELETE FROM coupons WHERE id = ?').bind(c.id).run();
  return json({ ok: true, message: `Usunięto kod ${c.code}.` });
}
