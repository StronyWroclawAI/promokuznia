import { problem } from '../../../_lib/http.js';

// GET /api/admin/uploads/:id — plik klienta do produkcji (zawsze jako pobranie)
export async function onRequestGet({ env, params }) {
  const up = await env.DB.prepare('SELECT * FROM uploads WHERE id = ?').bind(String(params.id)).first();
  if (!up || !env.FILES) return problem(404, 'Nie znaleziono pliku.');
  const obj = await env.FILES.get(up.r2_key);
  if (!obj) return problem(404, 'Plik zniknął z R2.');
  return new Response(obj.body, {
    headers: {
      'content-type': up.mime,
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(up.filename)}`,
      'cache-control': 'private, no-store'
    }
  });
}
