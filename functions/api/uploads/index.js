import { json, problem } from '../../_lib/http.js';
import { resolveCart } from '../../_lib/cart.js';

export const MAX_UPLOAD = 20 * 1024 * 1024; // 20 MB

// Typ rozpoznajemy po pierwszych bajtach pliku, nie po rozszerzeniu ani nagłówku przeglądarki
function sniff(bytes, filename) {
  const b = bytes;
  const ascii = (n) => String.fromCharCode(...b.slice(0, n));
  if (ascii(5) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (b[0] === 0x89 && ascii(4).slice(1) === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (/\.svg$/i.test(filename) && (head.startsWith('<svg') || head.startsWith('<?xml'))) return { mime: 'image/svg+xml', ext: 'svg' };
  if (ascii(4) === '%!PS') return { mime: 'application/postscript', ext: /\.ai$/i.test(filename) ? 'ai' : 'eps' };
  return null;
}

const safeName = (n) => String(n || 'plik').normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'plik';

// POST /api/uploads  (multipart/form-data, pole „file”)
export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.FILES) return problem(503, 'Przechowywanie plików nie jest skonfigurowane (brak bindingu R2 „FILES”).');

  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_UPLOAD + 64 * 1024) return problem(413, 'Plik jest za duży. Maksymalnie 20 MB.');

  let form;
  try { form = await request.formData(); } catch { return problem(400, 'Nie udało się odczytać pliku. Spróbuj ponownie.'); }
  const file = form.get('file');
  if (!file || typeof file === 'string') return problem(400, 'Wybierz plik do wgrania.');
  if (file.size > MAX_UPLOAD) return problem(413, 'Plik jest za duży. Maksymalnie 20 MB.');
  if (file.size === 0) return problem(400, 'Plik jest pusty.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes, file.name);
  if (!kind) return problem(415, 'Akceptujemy PDF, PNG, JPG, SVG, AI i EPS.');

  const cart = await resolveCart(context, { create: true });
  const id = crypto.randomUUID();
  const name = safeName(file.name);
  const key = `uploads/${new Date().toISOString().slice(0, 7)}/${id}/${name}`;

  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType: kind.mime },
    customMetadata: { cart_id: String(cart.id), original_name: file.name.slice(0, 200) }
  });
  await env.DB.prepare('INSERT INTO uploads (id, r2_key, cart_id, filename, mime, size) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, key, cart.id, file.name.slice(0, 200), kind.mime, file.size).run();

  return json({ upload: { id, filename: file.name.slice(0, 200), size: file.size, mime: kind.mime } }, { status: 201 });
}
