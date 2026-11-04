import { json, problem, readJson } from '../../../_lib/http.js';
import { normalizeProduct, loadIndex, plan, saveProduct } from '../../../_lib/products-admin.js';

const MAX_PER_REQUEST = 25; // panel wysyła duże pliki w paczkach po 25 produktów

// POST /api/admin/products/import  { products: [...], dry_run?: true }
// dry_run sprawdza wszystko i mówi, co się stanie — nic nie zapisuje. Każdy produkt zapisuje się osobno,
// więc błąd w jednym nie blokuje pozostałych.
export async function onRequestPost({ env, request }) {
  const body = await readJson(request, 1024 * 1024);
  if (!body || !Array.isArray(body.products)) return problem(400, 'Brak listy produktów.');
  if (body.products.length > MAX_PER_REQUEST) return problem(413, `Maksymalnie ${MAX_PER_REQUEST} produktów w jednym żądaniu.`);

  const index = await loadIndex(env.DB);
  const cats = [...index.categories.keys()];
  const seen = new Set();
  const results = [];
  for (const [i, input] of body.products.entries()) {
    const row = input?._row ?? null;
    const { value, errors } = normalizeProduct(input, cats);
    if (errors.length) { results.push({ i, row, slug: input?.slug || null, name: input?.name || null, ok: false, errors }); continue; }
    if (seen.has(value.slug)) { results.push({ i, row, slug: value.slug, name: value.name, ok: false, errors: ['Ten sam produkt (slug) występuje w pliku dwa razy.'] }); continue; }
    seen.add(value.slug);
    const p = plan(value, index);
    if (p.errors.length) { results.push({ i, row, slug: value.slug, name: value.name, ok: false, action: p.action, errors: p.errors }); continue; }
    if (body.dry_run) { results.push({ i, row, slug: value.slug, name: value.name, ok: true, action: p.action, variants: value.variants.length }); continue; }
    try {
      const saved = await saveProduct(env.DB, value, index);
      results.push({ i, row, slug: saved.slug, name: value.name, ok: true, action: saved.action, id: saved.id, variants: value.variants.length });
    } catch (e) {
      console.error('import', value.slug, e?.message);
      results.push({ i, row, slug: value.slug, name: value.name, ok: false, errors: ['Nie udało się zapisać (konflikt w bazie). Spróbuj ponownie.'] });
    }
  }
  return json({ results, dry_run: !!body.dry_run });
}
