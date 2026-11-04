import { json, edgeCached } from '../_lib/http.js';
import { listCategories } from '../_lib/catalog.js';

// GET /api/categories — kategorie z produktami; ?wszystkie=1 — wszystkie (formularz w panelu)
export async function onRequestGet({ env, request }) {
  const all = new URL(request.url).searchParams.get('wszystkie') === '1';
  if (all) return json({ categories: await listCategories(env.DB, { all: true }) });
  return edgeCached(request, 60, async () => json({ categories: await listCategories(env.DB) }, { cache: 'public, max-age=30' }));
}
