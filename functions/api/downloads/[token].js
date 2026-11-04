import { problem, nowIso } from '../../_lib/http.js';

// GET /api/downloads/:token — produkt cyfrowy: link ważny 7 dni, maks. 5 pobrań
export async function onRequestGet({ env, params }) {
  const db = env.DB;
  const d = await db.prepare(
    `SELECT d.*, oi.name, o.status FROM downloads d
       JOIN order_items oi ON oi.id = d.order_item_id JOIN orders o ON o.id = oi.order_id
      WHERE d.token = ?`
  ).bind(String(params.token)).first();
  if (!d || ['anulowane', 'zwrocone', 'czeka_na_platnosc'].includes(d.status)) return problem(404, 'Nie znaleziono pliku.');
  if (d.expires_at < nowIso()) return problem(410, 'Link wygasł. Napisz do nas, wyślemy nowy.');

  // licznik zwiększamy warunkowo w jednym zapytaniu — dwa równoległe kliknięcia nie przekroczą limitu
  const hit = await db.prepare('UPDATE downloads SET downloads = downloads + 1 WHERE id = ? AND downloads < max_downloads').bind(d.id).run();
  if (hit.meta.changes !== 1) return problem(410, 'Wykorzystano limit pobrań. Napisz do nas, odblokujemy link.');

  const obj = env.FILES ? await env.FILES.get(d.r2_key) : null;
  const filename = d.r2_key.split('/').pop();
  if (obj) {
    return new Response(obj.body, {
      headers: {
        'content-type': obj.httpMetadata?.contentType ?? 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store'
      }
    });
  }
  if (env.SHOP_MODE !== 'demo') return problem(404, 'Plik jest chwilowo niedostępny. Napisz do nas.');
  // demo: w R2 nie ma prawdziwych szablonów, oddajemy plik informacyjny
  const text = `PromoKuźnia — sklep demonstracyjny\n\nProdukt: ${d.name}\nPobranie ${d.downloads + 1} z ${d.max_downloads}, link ważny do ${d.expires_at}.\n\nW prawdziwym sklepie tutaj byłby plik ${d.r2_key} z bucketu R2.\n`;
  return new Response(text, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${filename.replace(/\.zip$/, '')}-demo.txt"`,
      'cache-control': 'private, no-store'
    }
  });
}
