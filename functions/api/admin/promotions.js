import { json, problem, readJson } from '../../_lib/http.js';
import { startPromotion, PromoError } from '../../_lib/promotions.js';

// GET /api/admin/promotions — trwające i ostatnie zakończone promocje
export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT pr.*, p.name, p.slug FROM promotions pr JOIN products p ON p.id = pr.product_id
      ORDER BY pr.ended_at IS NOT NULL, pr.created_at DESC LIMIT 50`
  ).all();
  return json({ promotions: results.map(({ base_prices_json, ...r }) => ({ ...r, base: JSON.parse(base_prices_json || '{}') })) });
}

// POST /api/admin/promotions  { product_id, percent, ends_at?, label? }
export async function onRequestPost({ env, request }) {
  const body = await readJson(request);
  if (!body) return problem(400, 'Nieprawidłowe dane.');
  try {
    const r = await startPromotion(env.DB, body);
    return json({ message: `Promocja −${r.percent}% na „${r.product}” trwa. Ceny w sklepie odświeżą się w ciągu minuty.` }, { status: 201 });
  } catch (e) {
    if (e instanceof PromoError) return problem(e.status, e.message);
    throw e;
  }
}
