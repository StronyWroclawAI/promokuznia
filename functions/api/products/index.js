import { json } from '../../_lib/http.js';
import { listProducts } from '../../_lib/catalog.js';

// GET /api/products?kategoria=druk-firmowy&q=kubek&typ=digital&sort=cena-rosnaco
export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const products = await listProducts(env.DB, {
    category: url.searchParams.get('kategoria') || undefined,
    q: url.searchParams.get('q')?.trim().slice(0, 60) || undefined,
    type: url.searchParams.get('typ') || undefined,
    sort: url.searchParams.get('sort') || undefined,
    limit: url.searchParams.get('limit') || undefined
  });
  return json({ products, count: products.length }, { cache: 'public, max-age=60' });
}
