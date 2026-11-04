import { json, problem } from '../../_lib/http.js';
import { resolveCart } from '../../_lib/cart.js';

async function ownUpload(context) {
  const cart = await resolveCart(context);
  if (!cart) return null;
  return context.env.DB.prepare('SELECT * FROM uploads WHERE id = ? AND cart_id = ?')
    .bind(String(context.params.id), cart.id).first();
}

// GET /api/uploads/:id — podgląd pliku tylko dla właściciela koszyka
export async function onRequestGet(context) {
  const up = await ownUpload(context);
  if (!up) return problem(404, 'Nie znaleziono pliku.');
  const obj = await context.env.FILES.get(up.r2_key);
  if (!obj) return problem(404, 'Nie znaleziono pliku.');
  const inline = up.mime === 'image/png' || up.mime === 'image/jpeg' || up.mime === 'application/pdf';
  return new Response(obj.body, {
    headers: {
      'content-type': up.mime,
      'content-length': String(up.size),
      // SVG/AI/EPS tylko do pobrania: SVG otwarty w przeglądarce mógłby uruchomić skrypt
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(up.filename)}`,
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      'cache-control': 'private, no-store'
    }
  });
}

// DELETE /api/uploads/:id — usuwa plik i odpina go od pozycji koszyka
export async function onRequestDelete(context) {
  const up = await ownUpload(context);
  if (!up) return problem(404, 'Nie znaleziono pliku.');
  await context.env.FILES.delete(up.r2_key);
  await context.env.DB.batch([
    context.env.DB.prepare('UPDATE cart_items SET upload_id = NULL WHERE upload_id = ?').bind(up.id),
    context.env.DB.prepare('DELETE FROM uploads WHERE id = ?').bind(up.id)
  ]);
  return json({ ok: true });
}
