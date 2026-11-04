import { json } from '../_lib/http.js';
import { listCategories } from '../_lib/catalog.js';

// GET /api/categories
export async function onRequestGet({ env }) {
  const categories = await listCategories(env.DB);
  return json({ categories }, { cache: 'public, max-age=60' });
}
