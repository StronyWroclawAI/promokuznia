import { json, edgeCached } from '../../_lib/http.js';
import { listProducts } from '../../_lib/catalog.js';

// GET /api/products?kategoria=wizytowki&q=plakat&typ=physical&sort=cena-rosnaco
export async function onRequestGet({ env, request }) {
  return edgeCached(request, 60, async () => {
    const url = new URL(request.url);
    const products = await listProducts(env.DB, {
      category: url.searchParams.get('kategoria') || undefined,
      q: url.searchParams.get('q')?.trim().slice(0, 60) || undefined,
      type: url.searchParams.get('typ') || undefined,
      sort: url.searchParams.get('sort') || undefined,
      limit: url.searchParams.get('limit') || undefined
    });
    return json({ products, count: products.length }, { cache: 'public, max-age=30' });
  });
}
