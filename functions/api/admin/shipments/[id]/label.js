import { problem } from '../../../../_lib/http.js';
import { labelPdf } from '../../../../_lib/inpost.js';

// GET /api/admin/shipments/:id/label?format=A6|A4 — etykieta pobierana przez serwer (token InPost nie trafia do przeglądarki)
export async function onRequestGet({ env, params, request }) {
  const s = await env.DB.prepare('SELECT s.*, o.number FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.id = ?').bind(Number(params.id)).first();
  if (!s?.external_id) return problem(404, 'Ta przesyłka nie ma etykiety.');
  const format = new URL(request.url).searchParams.get('format') === 'A4' ? 'A4' : 'A6';
  try {
    const pdf = await labelPdf(env, s, format);
    return new Response(pdf, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="etykieta-${s.number.replace(/\//g, '-')}.pdf"`,
        'cache-control': 'private, no-store'
      }
    });
  } catch (err) {
    return problem(502, `${err.message}. Jeśli przesyłka jest świeża, odczekaj chwilę i odśwież status.`);
  }
}
