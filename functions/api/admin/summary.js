import { json, nowIso } from '../../_lib/http.js';
import { releaseExpired, STATUS_LABEL } from '../../_lib/orders.js';

const DAY = 86400000;
// Sprzedaż = zamówienia opłacone (lub za pobraniem) bez anulowanych i zwróconych
const SOLD = `status NOT IN ('czeka_na_platnosc','anulowane','zwrocone')`;

// GET /api/admin/summary — pulpit: sprzedaż, rzeczy do zrobienia, niskie stany
export async function onRequestGet({ env }) {
  const db = env.DB;
  await releaseExpired(db);
  // północ czasu polskiego (z uwzględnieniem czasu letniego) w UTC
  const now = new Date();
  const offset = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', timeZoneName: 'longOffset' })
    .formatToParts(now).find((x) => x.type === 'timeZoneName').value.replace('GMT', '') || '+00:00';
  const startOfDay = new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Europe/Warsaw' })}T00:00:00${offset}`).toISOString();
  const [byStatus, today, week, month, todo, low, daily] = await db.batch([
    db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status'),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_gr),0) AS gr FROM orders WHERE ${SOLD} AND created_at >= ?`).bind(startOfDay.replace(/\.\d{3}Z$/, 'Z')),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_gr),0) AS gr FROM orders WHERE ${SOLD} AND created_at >= ?`).bind(nowIso(-7 * DAY)),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_gr),0) AS gr FROM orders WHERE ${SOLD} AND created_at >= ?`).bind(nowIso(-30 * DAY)),
    db.prepare(
      `SELECT
         SUM(status = 'czeka_na_platnosc' AND payment_method = 'przelew') AS przelewy,
         SUM(status = 'akceptacja_projektu') AS projekty,
         SUM(status = 'w_realizacji' AND shipping_method NOT IN ('brak')) AS do_wyslania,
         SUM(status = 'w_realizacji' AND shipping_method = 'brak') AS uslugi,
         SUM(status = 'wyslane') AS w_drodze
       FROM orders`
    ),
    db.prepare(
      `SELECT p.name, p.slug, v.id, v.sku, v.label, v.stock, v.reserved
         FROM variants v JOIN products p ON p.id = v.product_id
        WHERE v.active = 1 AND p.active = 1 AND v.stock IS NOT NULL AND v.stock < 999 AND v.stock - v.reserved < 10
        ORDER BY v.stock - v.reserved, p.name LIMIT 12`
    ),
    db.prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n, SUM(total_gr) AS gr
         FROM orders WHERE ${SOLD} AND created_at >= ? GROUP BY day ORDER BY day`
    ).bind(nowIso(-14 * DAY))
  ]);
  const t = todo.results[0] ?? {};
  return json({
    counts: Object.fromEntries(byStatus.results.map((r) => [r.status, r.n])),
    labels: STATUS_LABEL,
    sales: {
      today: today.results[0], week: week.results[0], month: month.results[0],
      avg_basket_gr: month.results[0].n ? Math.round(month.results[0].gr / month.results[0].n) : 0
    },
    todo: {
      przelewy: t.przelewy ?? 0, projekty: t.projekty ?? 0, do_wyslania: t.do_wyslania ?? 0,
      uslugi: t.uslugi ?? 0, w_drodze: t.w_drodze ?? 0
    },
    low_stock: low.results,
    daily: daily.results
  });
}
