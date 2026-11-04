import { json, problem, readJson, nowIso } from '../../../_lib/http.js';
import { productsForAdmin } from '../../../_lib/products-admin.js';

// GET /api/admin/products/:id — pełne dane do formularza edycji
export async function onRequestGet({ env, params }) {
  const [product] = await productsForAdmin(env.DB, Number(params.id) || -1);
  if (!product) return problem(404, 'Nie ma takiego produktu.');
  return json({ product });
}

// PATCH /api/admin/products/:id  { active } — ukrycie produktu w sklepie bez kasowania historii zamówień
export async function onRequestPatch({ env, params, request }) {
  const body = await readJson(request);
  if (!body || !('active' in body)) return problem(400, 'Podaj, czy produkt ma być widoczny.');
  const r = await env.DB.prepare('UPDATE products SET active = ?, updated_at = ? WHERE id = ?')
    .bind(body.active ? 1 : 0, nowIso(), Number(params.id)).run();
  if (r.meta.changes !== 1) return problem(404, 'Nie ma takiego produktu.');
  return json({ ok: true, message: body.active ? 'Produkt widoczny w sklepie.' : 'Produkt ukryty.' });
}
