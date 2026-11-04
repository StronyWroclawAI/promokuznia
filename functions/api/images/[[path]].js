// GET /api/images/products/... — publiczne zdjęcia produktów z R2 (wgrane w panelu).
// Pliki klientów (uploads/...) są pod innym prefiksem i tędy nie wyjdą.
export async function onRequestGet({ env, params, request }) {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join('/');
  if (!/^products\/[\w.\-/]+$/.test(key) || key.includes('..') || !env.FILES) return new Response('Nie znaleziono', { status: 404 });
  const obj = await env.FILES.get(key, { onlyIf: request.headers });
  if (!obj) return new Response('Nie znaleziono', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable'); // klucz zawiera losowe id — plik się nie zmienia
  headers.set('x-content-type-options', 'nosniff');
  if (!('body' in obj) || obj.body === undefined) return new Response(null, { status: 304, headers });
  return new Response(obj.body, { headers });
}
