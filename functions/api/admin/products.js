import { json } from '../../_lib/http.js';

// GET /api/admin/products — wszystkie produkty (także ukryte) ze stanami i rezerwacjami
export async function onRequestGet({ env }) {
  const db = env.DB;
  const [products, variants, sold] = await db.batch([
    db.prepare(
      `SELECT p.id, p.slug, p.name, p.type, p.active, c.name AS category
         FROM products p JOIN categories c ON c.id = p.category_id ORDER BY c.sort, p.id`
    ),
    db.prepare('SELECT id, product_id, sku, label, price_gr, stock, reserved, active FROM variants ORDER BY product_id, sort'),
    db.prepare(
      `SELECT i.variant_id, SUM(i.qty) AS qty FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.status NOT IN ('czeka_na_platnosc','anulowane','zwrocone') GROUP BY i.variant_id`
    )
  ]);
  const soldBy = Object.fromEntries(sold.results.map((r) => [r.variant_id, r.qty]));
  return json({
    products: products.results.map((p) => ({
      ...p,
      active: !!p.active,
      variants: variants.results.filter((v) => v.product_id === p.id).map((v) => ({ ...v, active: !!v.active, sold: soldBy[v.id] ?? 0 }))
    }))
  });
}
