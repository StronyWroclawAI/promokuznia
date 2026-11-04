// Maile transakcyjne przez Resend (https://resend.com/docs/api-reference/emails/send-email).
// Bez klucza RESEND_API_KEY mail nie wychodzi, tylko trafia do logu i dziennika `emails` (status „pominiety”).
// Błąd wysyłki nigdy nie psuje zamówienia — wołamy to przez context.waitUntil po odpowiedzi do klienta.
import { STATUS_LABEL } from './orders.js';

const DEFAULT_FROM = 'PromoKuźnia <zamowienia@stronyaiwroclaw.pl>';
const money = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const zl = (gr) => money.format((gr ?? 0) / 100);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (iso) => new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });

// ───────────── Wysyłka ─────────────

export async function sendMail(env, { to, subject, html, text, kind, orderId = null, idempotencyKey }) {
  const db = env.DB;
  const log = (status, extra = {}) => db.prepare(
    'INSERT INTO emails (order_id, kind, to_email, subject, status, provider_id, error) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(orderId, kind, to, subject, status, extra.id ?? null, extra.error ?? null).run().catch(() => {});

  if (!env.RESEND_API_KEY) {
    console.log(`[mail pominięty — brak RESEND_API_KEY] ${kind} → ${to}: ${subject}`);
    await log('pominiety');
    return { skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {})
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || DEFAULT_FROM,
        to: [to],
        subject,
        html,
        text,
        ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message ?? `HTTP ${res.status}`);
    await log('wyslany', { id: data.id });
    return { id: data.id };
  } catch (err) {
    console.error('Resend', kind, to, err?.message ?? err);
    await log('blad', { error: String(err?.message ?? err).slice(0, 300) });
    return { error: true };
  }
}

// ───────────── Układ maila ─────────────
// Tabele i style w linii — tak, żeby wyglądało dobrze w Gmailu, Outlooku i aplikacjach na telefonie.

const C = { ink: '#15171c', muted: '#5a5f69', line: '#d4d7d1', paper: '#eef0ec', sheet: '#ffffff', m: '#c8175d', c: '#0a8db6', y: '#e9b800' };
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

function layout({ preheader, title, intro, body = '', cta, footerNote }) {
  const bar = [C.c, C.m, C.y, C.ink].map((col) => `<td width="25%" height="4" style="background:${col};font-size:0;line-height:0">&nbsp;</td>`).join('');
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.paper}">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.sheet};border:1px solid ${C.line};">
  <tr><td style="padding:0;font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${bar}</tr></table></td></tr>
  <tr><td style="padding:24px 28px 8px;font-family:${FONT};">
    <span style="font-size:22px;font-weight:800;color:${C.ink};letter-spacing:-0.3px;">Promo<span style="color:${C.m}">Kuźnia</span></span>
  </td></tr>
  <tr><td style="padding:8px 28px 0;font-family:${FONT};">
    <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:${C.ink};">${esc(title)}</h1>
    <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:${C.muted};">${intro}</p>
  </td></tr>
  ${body ? `<tr><td style="padding:0 28px;font-family:${FONT};font-size:15px;line-height:1.5;color:${C.ink};">${body}</td></tr>` : ''}
  ${cta ? `<tr><td style="padding:8px 28px 28px;font-family:${FONT};">
    <a href="${esc(cta.href)}" style="display:inline-block;background:${C.m};color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:4px;">${esc(cta.label)}</a>
  </td></tr>` : '<tr><td style="padding:0 0 20px;"></td></tr>'}
  <tr><td style="padding:16px 28px 24px;border-top:1px solid ${C.line};font-family:${FONT};font-size:12px;line-height:1.5;color:${C.muted};">
    ${footerNote ? `${footerNote}<br><br>` : ''}PromoKuźnia — sklep demonstracyjny, projekt portfolio Strony AI Wrocław. Zamówienia nie są realizowane, a płatności działają w trybie testowym.
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

function itemsTable(items, totals) {
  const rows = items.map((i) => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid ${C.line};">${esc(i.name)}<br><span style="color:${C.muted};font-size:13px;">${esc(i.variant_label)} × ${i.qty}</span></td>
    <td align="right" style="padding:8px 0;border-bottom:1px solid ${C.line};white-space:nowrap;">${zl(i.unit_price_gr * i.qty)}</td></tr>`).join('');
  const sum = (label, value, strong) => `<tr><td style="padding:4px 0;${strong ? 'font-weight:700;font-size:17px;' : `color:${C.muted};`}">${label}</td><td align="right" style="padding:4px 0;white-space:nowrap;${strong ? 'font-weight:700;font-size:17px;' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;font-size:15px;">
    ${rows}
    ${sum('Produkty', zl(totals.subtotal_gr))}
    ${totals.discount_gr ? sum(`Rabat ${esc(totals.coupon_code ?? '')}`, `−${zl(totals.discount_gr)}`) : ''}
    ${sum('Dostawa', totals.shipping_gr ? zl(totals.shipping_gr) : 'gratis')}
    ${sum('Razem', zl(totals.total_gr), true)}
  </table>`;
}

function box(html, color = C.c) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr>
    <td style="border-left:4px solid ${color};background:${C.paper};padding:14px 16px;font-size:15px;line-height:1.5;">${html}</td></tr></table>`;
}

const SHIP = { paczkomat: 'Paczkomat InPost', kurier_inpost: 'Kurier InPost', odbior: 'Odbiór osobisty we Wrocławiu', brak: 'Bez wysyłki' };

function deliveryLine(o) {
  if (o.shipping_method === 'brak') return '';
  const s = o.shipping ?? {};
  const where = o.shipping_method === 'paczkomat' ? `Paczkomat <b>${esc(o.locker_code)}</b>`
    : o.shipping_method === 'kurier_inpost' ? `${esc(s.street)}, ${esc(s.postcode)} ${esc(s.city)}`
    : 'ul. Kowalska 12, Wrocław (adres przykładowy)';
  return `<p style="margin:0 0 20px;"><span style="color:${C.muted}">Dostawa:</span> ${esc(SHIP[o.shipping_method])} — ${where}${s.name ? `, odbiorca ${esc(s.name)}` : ''}</p>`;
}

const textItems = (o) => o.items.map((i) => `- ${i.name} (${i.variant_label}) × ${i.qty}: ${zl(i.unit_price_gr * i.qty)}`).join('\n')
  + `\nRazem: ${zl(o.totals.total_gr)}`;

// ───────────── Treści ─────────────

export const TEMPLATES = {
  przyjete(o) {
    const transfer = o.payment_method === 'przelew';
    const subject = `Przyjęliśmy zamówienie ${o.number}`;
    const intro = transfer
      ? 'Dziękujemy! Towar czeka na Ciebie przez 3 dni. Wyślemy go po zaksięgowaniu przelewu.'
      : 'Dziękujemy! Zamówienie jest za pobraniem — zapłacisz kurierowi przy odbiorze.';
    const bank = transfer ? box(`<b>Dane do przelewu</b><br>
      Odbiorca: PromoKuźnia — sklep demonstracyjny<br>
      Konto: <span style="font-family:monospace">PL00 0000 0000 0000 0000 0000 0000</span><br>
      Tytuł: <b>${esc(o.number)}</b><br>Kwota: <b>${zl(o.totals.total_gr)}</b><br>
      <span style="color:${C.muted};font-size:13px">Numer konta jest przykładowy — nie wpłacaj pieniędzy.</span>`, C.y) : '';
    return {
      subject,
      html: layout({ preheader: `${subject} · ${zl(o.totals.total_gr)}`, title: subject, intro, body: bank + itemsTable(o.items, o.totals) + deliveryLine(o), cta: { href: o.url, label: 'Zobacz zamówienie' } }),
      text: `${subject}\n\n${intro}\n\n${transfer ? `Przelew: konto PL00 0000 0000 0000 0000 0000 0000 (przykładowe), tytuł ${o.number}, kwota ${zl(o.totals.total_gr)}\n\n` : ''}${textItems(o)}\n\nZamówienie: ${o.url}`
    };
  },

  oplacone(o) {
    const subject = `Płatność przyjęta — zamówienie ${o.number}`;
    const personal = o.status === 'akceptacja_projektu';
    const done = o.status === 'zrealizowane';
    const intro = personal
      ? 'Dziękujemy za płatność. Grafik przygotuje podgląd z Twoim logo i wyśle go do akceptacji. Druk ruszy po Twoim „tak”.'
      : done ? 'Dziękujemy za płatność. Wszystko gotowe — pliki i kody znajdziesz poniżej.'
      : 'Dziękujemy za płatność. Zamówienie poszło do realizacji, a numer przesyłki wyślemy osobnym mailem.';
    const missing = o.items.filter((i) => i.project_status && !i.upload_id);
    let extra = '';
    if (missing.length) extra += box(`Nie dostaliśmy jeszcze pliku z logo do: <b>${missing.map((i) => esc(i.name)).join(', ')}</b>. Odpowiedz na tego maila i dołącz plik (PDF, PNG, SVG, AI lub EPS).`, C.m);
    if (o.downloads.length) extra += box(`<b>Do pobrania</b> (link ważny 7 dni, 5 pobrań):<br>${o.downloads.map((d) => `<a href="${esc(d.url)}" style="color:${C.c}">${esc(d.name)}</a>`).join('<br>')}`);
    if (o.gift_cards.length) extra += box(`<b>Karty podarunkowe</b>, ważne do ${date(o.gift_cards[0].valid_until)}:<br>${o.gift_cards.map((g) => `<span style="font-family:monospace;font-size:17px;letter-spacing:1px">${esc(g.code)}</span> — ${zl(g.balance_gr)}`).join('<br>')}`, C.m);
    return {
      subject,
      html: layout({ preheader: `${zl(o.totals.total_gr)} · ${STATUS_LABEL[o.status]}`, title: 'Płatność przyjęta', intro, body: extra + itemsTable(o.items, o.totals) + deliveryLine(o), cta: { href: o.url, label: 'Zobacz zamówienie' } }),
      text: `${subject}\n\n${intro}\n\n${o.downloads.map((d) => `Pobierz ${d.name}: ${d.url}`).join('\n')}${o.gift_cards.map((g) => `Karta podarunkowa: ${g.code} (${zl(g.balance_gr)})`).join('\n')}\n\n${textItems(o)}\n\nZamówienie: ${o.url}`
    };
  },

  projekt_do_poprawy(o, { note }) {
    const subject = `Potrzebujemy poprawki w projekcie — ${o.number}`;
    const intro = 'Zanim ruszymy z drukiem, prosimy o jedną zmianę:';
    return {
      subject,
      html: layout({ preheader: note, title: 'Poprawka w projekcie', intro, body: box(esc(note), C.m) + `<p style="margin:0 0 20px">Odpowiedz na tego maila i dołącz poprawiony plik. Druk ruszy zaraz po akceptacji.</p>`, cta: { href: o.url, label: 'Zobacz zamówienie' } }),
      text: `${subject}\n\n${intro}\n${note}\n\nOdpowiedz na tego maila i dołącz poprawiony plik.\n\nZamówienie: ${o.url}`
    };
  },

  projekt_zaakceptowany(o) {
    const subject = `Projekt zaakceptowany — drukujemy ${o.number}`;
    const intro = 'Dziękujemy za akceptację podglądu. Zamówienie jest w produkcji, a gdy paczka wyjedzie, wyślemy numer przesyłki.';
    return {
      subject,
      html: layout({ preheader: intro, title: 'Projekt zaakceptowany', intro, body: deliveryLine(o), cta: { href: o.url, label: 'Zobacz zamówienie' } }),
      text: `${subject}\n\n${intro}\n\nZamówienie: ${o.url}`
    };
  },

  wyslane(o, { tracking }) {
    if (o.shipping_method === 'odbior') {
      const subject = `Zamówienie ${o.number} czeka na odbiór`;
      const intro = 'Zamówienie jest gotowe. Odbierzesz je pod adresem ul. Kowalska 12, Wrocław (adres przykładowy), pon–pt 9–17. Weź ze sobą numer zamówienia.';
      return { subject, html: layout({ preheader: intro, title: 'Gotowe do odbioru', intro, cta: { href: o.url, label: 'Zobacz zamówienie' } }), text: `${subject}\n\n${intro}\n\n${o.url}` };
    }
    const subject = `Wysłaliśmy zamówienie ${o.number}`;
    const trackUrl = `https://inpost.pl/sledzenie-przesylek?number=${encodeURIComponent(tracking)}`;
    const intro = o.shipping_method === 'paczkomat'
      ? `Paczka jedzie do Paczkomatu ${esc(o.locker_code)}. SMS z kodem odbioru przyjdzie od InPost na numer z zamówienia.`
      : 'Paczka jest w drodze. Kurier InPost zadzwoni lub wyśle SMS przed doręczeniem.';
    return {
      subject,
      html: layout({ preheader: `Numer przesyłki ${tracking}`, title: 'Paczka w drodze', intro, body: box(`Numer przesyłki: <span style="font-family:monospace;font-size:16px">${esc(tracking)}</span>`) + deliveryLine(o), cta: { href: trackUrl, label: 'Śledź przesyłkę' } }),
      text: `${subject}\n\n${intro}\n\nNumer przesyłki: ${tracking}\nŚledzenie: ${trackUrl}\n\nZamówienie: ${o.url}`
    };
  },

  zwrot(o, { amount_gr, full }) {
    const subject = full ? `Zwrot pieniędzy za zamówienie ${o.number}` : `Częściowy zwrot — zamówienie ${o.number}`;
    const intro = `Zleciliśmy zwrot ${zl(amount_gr)}. Pieniądze wrócą tą samą drogą, którą płaciłeś — zwykle w 5–10 dni roboczych.`;
    return { subject, html: layout({ preheader: intro, title: full ? 'Zwrot pieniędzy' : 'Częściowy zwrot', intro, cta: { href: o.url, label: 'Zobacz zamówienie' } }), text: `${subject}\n\n${intro}\n\n${o.url}` };
  },

  anulowane(o) {
    const subject = `Zamówienie ${o.number} zostało anulowane`;
    const intro = 'Anulowaliśmy zamówienie, a zarezerwowany towar wrócił do sprzedaży. Jeśli to pomyłka, złóż zamówienie ponownie albo odpowiedz na tego maila.';
    return { subject, html: layout({ preheader: intro, title: 'Zamówienie anulowane', intro, cta: { href: o.shopUrl, label: 'Wróć do sklepu' } }), text: `${subject}\n\n${intro}\n\n${o.shopUrl}` };
  },

  reset_hasla(_o, { link }) {
    const subject = 'Ustaw nowe hasło do konta PromoKuźni';
    const intro = 'Ktoś (mamy nadzieję, że Ty) poprosił o zmianę hasła. Link działa 60 minut i tylko raz.';
    return {
      subject,
      html: layout({ preheader: intro, title: 'Nowe hasło', intro, cta: { href: link, label: 'Ustaw nowe hasło' }, footerNote: 'Jeśli to nie Ty, zignoruj tę wiadomość — hasło się nie zmieni.' }),
      text: `${subject}\n\n${intro}\n\n${link}\n\nJeśli to nie Ty, zignoruj tę wiadomość.`
    };
  },

  odstapienie_klient(d) {
    const subject = `Przyjęliśmy odstąpienie od umowy — ${d.number}`;
    const intro = 'Dziękujemy. Odeślij produkty w ciągu 14 dni. Pieniądze zwrócimy w ciągu 14 dni od dziś, najpóźniej po otrzymaniu paczki.';
    return {
      subject,
      html: layout({ preheader: intro, title: 'Odstąpienie przyjęte', intro, body: box(`<b>Produkty:</b> ${esc(d.items)}${d.account ? `<br><b>Konto do zwrotu:</b> ${esc(d.account)}` : ''}`) }),
      text: `${subject}\n\n${intro}\n\nProdukty: ${d.items}`
    };
  },

  odstapienie_sklep(d) {
    const subject = `Odstąpienie od umowy — ${d.number}`;
    return {
      subject,
      html: layout({ preheader: d.items, title: subject, intro: 'Klient wysłał oświadczenie przez formularz. Termin na zwrot pieniędzy: 14 dni.', body: box(`${esc(d.items)}${d.account ? `<br>Konto: ${esc(d.account)}` : ''}${d.note ? `<br>Uwagi: ${esc(d.note)}` : ''}`, C.m), cta: { href: d.adminUrl, label: 'Otwórz zamówienie' } }),
      text: `${subject}\n${d.items}\n${d.adminUrl}`
    };
  },

  dla_sklepu(o) {
    const subject = `Nowe zamówienie ${o.number} — ${zl(o.totals.total_gr)}`;
    const what = o.status === 'czeka_na_platnosc' ? 'Czeka na przelew.' : o.status === 'akceptacja_projektu' ? 'Do przygotowania podgląd projektu.' : o.payment_method === 'pobranie' ? 'Za pobraniem — do realizacji.' : 'Opłacone — do realizacji.';
    return {
      subject,
      html: layout({ preheader: what, title: subject, intro: `${esc(o.email)} · ${esc(SHIP[o.shipping_method])} · ${what}`, body: itemsTable(o.items, o.totals), cta: { href: o.adminUrl, label: 'Otwórz w panelu' } }),
      text: `${subject}\n${o.email}\n${what}\n\n${textItems(o)}\n\nPanel: ${o.adminUrl}`
    };
  }
};

// ───────────── Wysyłka maila o zamówieniu ─────────────

async function loadOrder(env, orderId, origin) {
  const db = env.DB;
  const order = await db.prepare('SELECT * FROM orders WHERE id = ?').bind(orderId).first();
  if (!order) return null;
  const [items, downloads, gifts] = await db.batch([
    db.prepare('SELECT name, variant_label, qty, unit_price_gr, project_status, upload_id FROM order_items WHERE order_id = ? ORDER BY id').bind(orderId),
    db.prepare(`SELECT d.token, oi.name FROM downloads d JOIN order_items oi ON oi.id = d.order_item_id WHERE oi.order_id = ?`).bind(orderId),
    db.prepare(`SELECT g.code, g.balance_gr, g.valid_until FROM gift_cards g JOIN order_items oi ON oi.id = g.order_item_id WHERE oi.order_id = ?`).bind(orderId)
  ]);
  const q = new URLSearchParams({ zamowienie: order.number });
  if (order.access_token) q.set('t', order.access_token);
  return {
    ...order,
    shipping: order.shipping_json ? JSON.parse(order.shipping_json) : null,
    items: items.results,
    downloads: downloads.results.map((d) => ({ name: d.name, url: `${origin}/api/downloads/${d.token}` })),
    gift_cards: gifts.results,
    totals: { subtotal_gr: order.subtotal_gr, discount_gr: order.discount_gr, shipping_gr: order.shipping_gr, total_gr: order.total_gr, coupon_code: order.coupon_code },
    url: `${origin}/?${q}#zamowienie`,
    shopUrl: `${origin}/`,
    adminUrl: `${origin}/admin/#z-${order.id}`
  };
}

// kind: przyjete | oplacone | projekt_do_poprawy | projekt_zaakceptowany | wyslane | zwrot | anulowane
export async function notifyOrder(env, origin, orderId, kind, extra = {}) {
  try {
    const o = await loadOrder(env, orderId, origin);
    if (!o) return;
    const t = TEMPLATES[kind](o, extra);
    await sendMail(env, { to: o.email, ...t, kind, orderId, idempotencyKey: `${kind}-${orderId}-${extra.key ?? ''}`.slice(0, 256) });
    // sklep dostaje powiadomienie raz na zamówienie: przy przyjęciu (przelew, pobranie) albo przy płatności online
    const newOrder = kind === 'przyjete' || (kind === 'oplacone' && (o.payment_method === 'stripe' || o.payment_method === 'przelewy24'));
    if (newOrder && env.ADMIN_EMAILS) {
      const shop = TEMPLATES.dla_sklepu(o);
      for (const to of env.ADMIN_EMAILS.split(',').map((e) => e.trim()).filter(Boolean)) {
        await sendMail(env, { to, ...shop, kind: 'dla_sklepu', orderId, idempotencyKey: `dla_sklepu-${orderId}-${to}` });
      }
    }
  } catch (err) {
    console.error('notifyOrder', kind, orderId, err?.message ?? err);
  }
}

// Wysłanie „w tle” — odpowiedź do klienta nie czeka na Resend
export function later(context, promise) {
  if (typeof context.waitUntil === 'function') context.waitUntil(promise);
  else return promise;
}
