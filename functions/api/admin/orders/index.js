import { json } from '../../../_lib/http.js';
import { STATUS_LABEL } from '../../../_lib/orders.js';

// GET /api/admin/orders?status=w_realizacji&q=kowal&strona=1
export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const q = url.searchParams.get('q')?.trim().slice(0, 60);
  const page = Math.max(1, Number(url.searchParams.get('strona')) || 1);
  const per = 30;

  const where = [];
  const binds = [];
  if (status === 'przelewy') { where.push(`o.status = 'czeka_na_platnosc' AND o.payment_method = 'przelew'`); }
  else if (status === 'do_wyslania') { where.push(`o.status = 'w_realizacji' AND o.shipping_method != 'brak'`); }
  else if (status && STATUS_LABEL[status]) { where.push('o.status = ?'); binds.push(status); }
  if (q) {
    where.push(`(o.number LIKE ? OR o.email LIKE ? OR o.shipping_json LIKE ? OR o.billing_json LIKE ?)`);
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [list, total] = await env.DB.batch([
    env.DB.prepare(
      `SELECT o.id, o.number, o.created_at, o.email, o.status, o.payment_method, o.shipping_method, o.total_gr,
              json_extract(o.shipping_json, '$.name') AS name, json_extract(o.billing_json, '$.company') AS company,
              (SELECT SUM(qty) FROM order_items i WHERE i.order_id = o.id) AS items,
              (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.project_status IS NOT NULL) AS personalized,
              (SELECT status FROM payments p WHERE p.order_id = o.id ORDER BY attempt DESC, id DESC LIMIT 1) AS payment_status
         FROM orders o ${sqlWhere}
        ORDER BY o.id DESC LIMIT ? OFFSET ?`
    ).bind(...binds, per, (page - 1) * per),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM orders o ${sqlWhere}`).bind(...binds)
  ]);
  return json({
    orders: list.results.map((o) => ({ ...o, status_label: STATUS_LABEL[o.status] })),
    total: total.results[0].n, page, per
  });
}
