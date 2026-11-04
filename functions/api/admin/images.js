import { json, problem } from '../../_lib/http.js';

const MAX = 8 * 1024 * 1024;

function sniff(b) {
  const ascii = (from, n) => String.fromCharCode(...b.slice(from, from + n));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (ascii(4, 4) === 'ftyp' && /avif|avis/.test(ascii(8, 4))) return { mime: 'image/avif', ext: 'avif' };
  return null;
}

// POST /api/admin/images (multipart, pole „file”) — zdjęcie produktu do R2. Zwraca src do zapisania przy produkcie.
export async function onRequestPost({ env, request }) {
  if (!env.FILES) return problem(503, 'Brak bindingu R2 „FILES” — dodaj go w ustawieniach projektu albo podaj adres URL zdjęcia.');
  if (Number(request.headers.get('content-length') || 0) > MAX + 64 * 1024) return problem(413, 'Zdjęcie jest za duże. Maksymalnie 8 MB.');
  let form;
  try { form = await request.formData(); } catch { return problem(400, 'Nie udało się odczytać pliku.'); }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) return problem(400, 'Wybierz zdjęcie.');
  if (file.size > MAX) return problem(413, 'Zdjęcie jest za duże. Maksymalnie 8 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return problem(415, 'Zdjęcie musi być w formacie JPG, PNG, WebP lub AVIF.');
  const key = `products/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${kind.ext}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: kind.mime, cacheControl: 'public, max-age=31536000, immutable' } });
  return json({ image: { src: `/api/images/${key}`, r2_key: key, alt: '' } }, { status: 201 });
}
