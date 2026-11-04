import { json, problem } from '../../_lib/http.js';
import { getProduct } from '../../_lib/catalog.js';

// GET /api/products/:slug
export async function onRequestGet({ env, params }) {
  const product = await getProduct(env.DB, String(params.slug));
  if (!product) return problem(404, 'Nie znaleziono produktu.');
  return json({ product }, { cache: 'public, max-age=60' });
}
