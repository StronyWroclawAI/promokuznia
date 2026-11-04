import { json, problem, readJson } from '../../_lib/http.js';
import { normalizeProduct, loadIndex, plan, saveProduct, productsForAdmin } from '../../_lib/products-admin.js';

// GET /api/admin/products — wszystkie produkty (także ukryte) ze stanami i rezerwacjami
export async function onRequestGet({ env }) {
  const db = env.DB;
  const [products, variants, sold] = await db.batch([
    db.prepare(
      `SELECT p.id, p.slug, p.name, p.type, p.active, c.name AS category,
              (SELECT COALESCE(NULLIF(i.src, ''), '/api/images/' || i.r2_key) FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort, i.id LIMIT 1) AS image
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

// POST /api/admin/products — zapis jednego produktu z formularza (nowy albo edycja; body.id = edycja)
export async function onRequestPost({ env, request }) {
  const body = await readJson(request, 128 * 1024);
  if (!body) return problem(400, 'Nieprawidłowe dane.');
  const index = await loadIndex(env.DB);
  const { value, errors } = normalizeProduct(body, [...index.categories.keys()]);
  if (errors.length) return problem(422, errors[0], { errors });
  const p = plan(value, index);
  if (p.errors.length) return problem(409, p.errors[0], { errors: p.errors });
  const saved = await saveProduct(env.DB, value, index);
  const [product] = await productsForAdmin(env.DB, saved.id);
  return json({ product, message: saved.action === 'nowy' ? 'Dodano produkt.' : 'Zapisano zmiany.' }, { status: saved.action === 'nowy' ? 201 : 200 });
}
