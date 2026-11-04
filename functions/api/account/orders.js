import { json, problem } from '../../_lib/http.js';

// GET /api/account/orders — historia zamówień zalogowanego klienta
export async function onRequestGet({ env, data }) {
  if (!data.customer) return problem(401, 'Zaloguj się, żeby zobaczyć zamówienia.');
  const { results } = await env.DB.prepare(
    `SELECT number, status, total_gr, created_at,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items
       FROM orders o WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50`
  ).bind(data.customer.id).all();
  return json({ orders: results });
}
