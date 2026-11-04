import { json, problem, readJson } from '../../_lib/http.js';
import { normalizeCoupon } from '../../_lib/coupons.js';

// GET /api/admin/coupons — wszystkie kody z liczbą użyć i sumą rabatów z opłaconych zamówień
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT c.*,
            (SELECT COALESCE(SUM(o.discount_gr), 0) FROM orders o WHERE o.coupon_code = c.code COLLATE NOCASE
               AND o.status NOT IN ('czeka_na_platnosc','anulowane')) AS discount_total_gr
       FROM coupons c ORDER BY c.active DESC, c.id DESC`
  ).all();
  return json({ coupons: results.map((c) => ({ ...c, active: !!c.active })) });
}

// POST /api/admin/coupons — nowy kod
export async function onRequestPost({ env, request }) {
  const { value, errors } = normalizeCoupon(await readJson(request));
  if (errors.length) return problem(422, errors[0], { errors });
  const exists = await env.DB.prepare('SELECT id FROM coupons WHERE code = ?').bind(value.code).first();
  if (exists) return problem(409, `Kod ${value.code} już istnieje.`);
  const row = await env.DB.prepare(
    'INSERT INTO coupons (code, kind, value, min_total_gr, max_uses, valid_until, active) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *'
  ).bind(value.code, value.kind, value.value, value.min_total_gr, value.max_uses, value.valid_until, value.active ? 1 : 0).first();
  return json({ coupon: { ...row, active: !!row.active }, message: `Dodano kod ${row.code}.` }, { status: 201 });
}
