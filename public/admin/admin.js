// Panel admina PromoKuźni. Widoki: #pulpit, #zamowienia, #z-<id>, #produkty, #produkt-<id|nowy>, #import.
// Logowanie to zwykłe konto sklepu; dostęp mają e-maile z sekretu ADMIN_EMAILS.

const main = document.getElementById('adm');
const nav = document.getElementById('adm-nav');
const userBox = document.getElementById('adm-user');
const toastEl = document.getElementById('toast');

const money = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
const zl = (gr) => money.format((gr ?? 0) / 100);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (iso, opts = { dateStyle: 'short', timeStyle: 'short' }) => (iso ? new Date(iso).toLocaleString('pl-PL', opts) : '—');

const SHIP = { paczkomat: 'Paczkomat', kurier_inpost: 'Kurier InPost', odbior: 'Odbiór osobisty', brak: 'Bez wysyłki', kurier_furgonetka: 'Kurier (Furgonetka)' };
const PAY = { stripe: 'Stripe', przelewy24: 'Przelewy24', przelew: 'Przelew', pobranie: 'Pobranie', symulator: 'Bramka testowa' };
const PAY_STATUS = { utworzona: 'oczekuje', oplacona: 'opłacona', odrzucona: 'odrzucona', zwrocona: 'zwrócona', czesciowo_zwrocona: 'częściowo zwrócona' };
const SOURCE = { klient: 'klient', webhook_platnosci: 'płatność', webhook_przewoznika: 'przewoźnik', admin: 'sklep', cron: 'automat' };
const PROJECT = { czeka: 'czeka na akceptację', zaakceptowany: 'zaakceptowany', do_poprawy: 'do poprawy' };

import { initProducts, viewProducts, viewProductEdit, viewImport } from './products.js';

let labels = {};
let toastTimer;
function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Błąd ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

const pill = (status) => `<span class="status-pill" data-status="${esc(status)}">${esc(labels[status] ?? status)}</span>`;

// ───────────── Pulpit ─────────────

async function viewDashboard() {
  const d = await api('GET', '/api/admin/summary');
  labels = d.labels;
  const t = d.todo;
  // wykres: ostatnie 14 dni, brakujące dni = 0
  const days = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10);
    const hit = d.daily.find((r) => r.day === day);
    return { day, gr: hit?.gr ?? 0, n: hit?.n ?? 0 };
  });
  const max = Math.max(...days.map((x) => x.gr), 1);
  main.innerHTML = `
    <div class="adm-title"><h1 class="h2">Pulpit</h1><span class="small mono">${dt(new Date().toISOString(), { dateStyle: 'full' })}</span></div>
    <div class="kpis">
      <div class="kpi"><span class="eyebrow">Dziś</span><span class="v">${zl(d.sales.today.gr)}</span><p class="small">${d.sales.today.n} zamówień</p></div>
      <div class="kpi"><span class="eyebrow">7 dni</span><span class="v">${zl(d.sales.week.gr)}</span><p class="small">${d.sales.week.n} zamówień</p></div>
      <div class="kpi"><span class="eyebrow">30 dni</span><span class="v">${zl(d.sales.month.gr)}</span><p class="small">${d.sales.month.n} zamówień</p></div>
      <div class="kpi"><span class="eyebrow">Średni koszyk</span><span class="v">${zl(d.sales.avg_basket_gr)}</span><p class="small">z ostatnich 30 dni</p></div>
    </div>
    <h2 class="h3" style="margin-bottom:var(--s-3)">Do zrobienia</h2>
    <div class="todo">
      <a href="#zamowienia" data-filter="przelewy" ${t.przelewy ? 'data-hot' : ''}><span class="n">${t.przelewy}</span><span>przelewy do potwierdzenia</span></a>
      <a href="#zamowienia" data-filter="akceptacja_projektu" ${t.projekty ? 'data-hot' : ''}><span class="n">${t.projekty}</span><span>projekty do akceptacji</span></a>
      <a href="#zamowienia" data-filter="do_wyslania" ${t.do_wyslania ? 'data-hot' : ''}><span class="n">${t.do_wyslania}</span><span>paczki do wysłania</span></a>
      <a href="#zamowienia" data-filter="wyslane"><span class="n">${t.w_drodze}</span><span>w drodze do klienta</span></a>
    </div>
    <div class="cols">
      <section>
        <h2 class="h3">Sprzedaż — ostatnie 14 dni</h2>
        <div class="bars" role="img" aria-label="Sprzedaż dzienna z ostatnich 14 dni, dziś ${zl(days.at(-1).gr)}">
          ${days.map((x) => `<div style="height:${(x.gr / max) * 100}%" title="${x.day}: ${zl(x.gr)} (${x.n} zam.)"></div>`).join('')}
        </div>
        <div class="bars-x" aria-hidden="true">${days.map((x, i) => `<span>${i % 2 === 1 ? '' : x.day.slice(8)}</span>`).join('')}</div>
        <p class="small">Najwyższy dzień: ${zl(max === 1 ? 0 : max)}. Ostatni słupek to dziś.</p>
      </section>
      <section>
        <h2 class="h3" style="margin-bottom:var(--s-3)">Kończy się na stanie</h2>
        ${d.low_stock.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produkt</th><th class="num">Dostępne</th></tr></thead><tbody>
          ${d.low_stock.map((v) => `<tr data-href="#produkty"><td class="wrap-cell">${esc(v.name)} <span class="small mono">${esc(v.label)}</span></td><td class="num ${v.stock - v.reserved <= 0 ? 'low' : ''}">${v.stock - v.reserved}${v.reserved ? ` <span class="small">(+${v.reserved} rez.)</span>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted">Wszystkie stany powyżej 10 szt.</p>'}
      </section>
    </div>`;
  main.querySelectorAll('[data-filter]').forEach((a) => a.addEventListener('click', () => { listState.status = a.dataset.filter; listState.page = 1; }));
}

// ───────────── Lista zamówień ─────────────

const listState = { status: '', q: '', page: 1 };

async function viewOrders() {
  const [summary, list] = await Promise.all([
    api('GET', '/api/admin/summary'),
    api('GET', `/api/admin/orders?${new URLSearchParams({ status: listState.status, q: listState.q, strona: listState.page })}`)
  ]);
  labels = summary.labels;
  const c = summary.counts;
  const all = Object.values(c).reduce((s, n) => s + n, 0);
  const chips = [
    ['', 'Wszystkie', all],
    ['przelewy', 'Przelewy do potwierdzenia', summary.todo.przelewy],
    ['akceptacja_projektu', labels.akceptacja_projektu, c.akceptacja_projektu ?? 0],
    ['do_wyslania', 'Do wysłania', summary.todo.do_wyslania],
    ['wyslane', labels.wyslane, c.wyslane ?? 0],
    ['czeka_na_platnosc', labels.czeka_na_platnosc, c.czeka_na_platnosc ?? 0],
    ['zrealizowane', labels.zrealizowane, c.zrealizowane ?? 0],
    ['anulowane', labels.anulowane, c.anulowane ?? 0],
    ['zwrocone', labels.zwrocone, c.zwrocone ?? 0]
  ];
  const pages = Math.max(1, Math.ceil(list.total / list.per));
  main.innerHTML = `
    <div class="adm-title"><h1 class="h2">Zamówienia</h1><span class="small mono">${list.total} wyników</span></div>
    <div class="chips">${chips.map(([k, l, n]) => `<a href="#zamowienia" data-status="${k}" aria-current="${listState.status === k}">${esc(l)}<b>${n}</b></a>`).join('')}</div>
    <form class="list-tools" id="search"><label class="sr-only" for="q">Szukaj</label>
      <input id="q" type="search" placeholder="Numer, e-mail, nazwisko, firma…" value="${esc(listState.q)}"><button class="btn" type="submit">Szukaj</button></form>
    ${list.orders.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Numer</th><th>Data</th><th>Klient</th><th>Status</th><th>Płatność</th><th>Dostawa</th><th class="num">Szt.</th><th class="num">Kwota</th></tr></thead><tbody>
      ${list.orders.map((o) => `<tr data-href="#z-${o.id}">
        <td><a href="#z-${o.id}" class="mono">${esc(o.number)}</a>${o.personalized ? '<span class="dot" title="Z plikiem do personalizacji"></span>' : ''}</td>
        <td>${dt(o.created_at)}</td>
        <td class="wrap-cell">${esc(o.company || o.name || '—')}<br><span class="small">${esc(o.email)}</span></td>
        <td>${pill(o.status)}</td>
        <td>${esc(PAY[o.payment_method])}<br><span class="small">${esc(PAY_STATUS[o.payment_status] ?? '—')}</span></td>
        <td>${esc(SHIP[o.shipping_method] ?? o.shipping_method)}</td>
        <td class="num">${o.items}</td>
        <td class="num">${zl(o.total_gr)}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty"><p class="muted">Brak zamówień w tym widoku.</p></div>'}
    ${pages > 1 ? `<div class="pager"><button class="btn" type="button" data-page="${list.page - 1}" ${list.page <= 1 ? 'disabled' : ''}>Nowsze</button><span class="mono">${list.page} / ${pages}</span><button class="btn" type="button" data-page="${list.page + 1}" ${list.page >= pages ? 'disabled' : ''}>Starsze</button></div>` : ''}`;

  main.querySelectorAll('.chips a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); listState.status = a.dataset.status; listState.page = 1; render();
  }));
  document.getElementById('search').addEventListener('submit', (e) => {
    e.preventDefault(); listState.q = document.getElementById('q').value.trim(); listState.page = 1; render();
  });
  main.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { listState.page = Number(b.dataset.page); render(); }));
}

// ───────────── Szczegóły zamówienia ─────────────

function actionsPanel(o) {
  const a = new Set(o.actions);
  const blocks = [];
  if (a.has('mark_paid')) blocks.push(`<div class="act"><p class="small">Sprawdź na wyciągu wpłatę ${zl(o.totals.total_gr)} z tytułem <b class="mono">${esc(o.number)}</b>.</p>
    <div class="act-row"><button class="btn btn-primary" data-act="mark_paid">Potwierdź wpłatę</button></div></div>`);
  if (a.has('approve_project')) blocks.push(`<div class="act"><p class="small">Klient zatwierdził podgląd z logo? Druk ruszy po akceptacji.</p>
    <div class="act-row"><button class="btn btn-primary" data-act="approve_project">Projekt zaakceptowany</button></div></div>`);
  if (a.has('request_changes')) blocks.push(`<div class="act"><label class="small" for="chg">Uwagi do projektu dla klienta</label>
    <textarea id="chg" rows="2" placeholder="np. logo w niskiej rozdzielczości — prosimy o plik wektorowy"></textarea>
    <div class="act-row"><button class="btn" data-act="request_changes" data-note="#chg">Wyślij klientowi: projekt do poprawy</button></div></div>`);
  const sh = o.shipments.filter((x) => x.status !== 'canceled').at(-1);
  if (a.has('create_shipment')) {
    const p = o.inpost.parcel;
    blocks.push(o.shipping_method === 'paczkomat'
      ? `<div class="act"><p class="small">Paczkomat <b class="mono">${esc(o.locker_code)}</b>${o.payment_method === 'pobranie' ? ` · pobranie ${zl(o.totals.total_gr)}` : ''}${o.inpost.mode === 'symulator' ? ' · <b>tryb testowy</b>' : ''}</p>
        <div class="act-row"><label class="small" for="psize">Gabaryt</label>
          <select id="psize">${['A', 'B', 'C'].map((g) => `<option value="${g}" ${p.size === g ? 'selected' : ''}>${g} — ${{ A: '8 × 38 × 64 cm', B: '19 × 38 × 64 cm', C: '41 × 38 × 64 cm' }[g]}</option>`).join('')}</select></div>
        <div class="act-row"><button class="btn btn-primary" data-act="create_shipment">Utwórz przesyłkę InPost</button></div></div>`
      : `<div class="act"><p class="small">Kurier InPost${o.payment_method === 'pobranie' ? ` · pobranie ${zl(o.totals.total_gr)}` : ''}${o.inpost.mode === 'symulator' ? ' · <b>tryb testowy</b>' : ''}</p>
        <div class="act-row dims">
          <label>kg<input type="number" id="pw" min="0.1" max="30" step="0.1" value="${p.weight_kg}"></label>
          <label>dł. cm<input type="number" id="pl" min="1" value="${p.length_cm}"></label>
          <label>szer.<input type="number" id="pwd" min="1" value="${p.width_cm}"></label>
          <label>wys.<input type="number" id="ph" min="1" value="${p.height_cm}"></label></div>
        <div class="act-row"><button class="btn btn-primary" data-act="create_shipment">Zamów kuriera InPost</button></div></div>`);
  }
  if (sh?.label_url) blocks.push(`<div class="act"><p class="small">Przesyłka <b class="mono">${esc(sh.tracking_number ?? 'numer w drodze…')}</b> · ${esc(sh.status_label ?? sh.status)}</p>
    <div class="act-row"><a class="btn" href="${esc(sh.label_url)}" target="_blank" rel="noopener">Etykieta A6</a><a class="btn" href="${esc(sh.label_url)}?format=A4" target="_blank" rel="noopener">A4</a>
    ${a.has('refresh_shipment') ? '<button class="btn" data-act="refresh_shipment">Odśwież status</button>' : ''}</div>
    <p class="small">Gdy InPost odbierze paczkę, zamówienie samo zmieni się na „Wysłane”, a klient dostanie mail z numerem.</p></div>`);
  if (a.has('ship')) blocks.push(o.shipping_method === 'odbior'
    ? `<div class="act"><div class="act-row"><button class="btn btn-primary" data-act="ship">Gotowe do odbioru</button></div></div>`
    : sh?.tracking_number
      ? `<div class="act"><div class="act-row"><button class="btn" data-act="ship">Oznacz jako wysłane ręcznie</button></div></div>`
      : `<div class="act"><label class="small" for="trk">${a.has('create_shipment') ? 'Albo wpisz numer z innego przewoźnika' : 'Numer przesyłki'} ${o.locker_code ? `(Paczkomat <span class="mono">${esc(o.locker_code)}</span>)` : ''}</label>
      <div class="act-row"><input type="text" id="trk" placeholder="np. 520000012345678901234567" autocomplete="off"><button class="btn" data-act="ship" data-tracking="#trk">Oznacz jako wysłane</button></div></div>`);
  if (a.has('deliver')) blocks.push(`<div class="act"><div class="act-row"><button class="btn btn-primary" data-act="deliver">${o.shipping_method === 'odbior' ? 'Odebrane przez klienta' : 'Doręczone'}</button></div></div>`);
  if (a.has('complete')) blocks.push(`<div class="act"><div class="act-row"><button class="btn btn-primary" data-act="complete">Zakończ zamówienie</button></div></div>`);
  if (a.has('refund')) {
    const left = o.refundable_gr;
    const physical = o.items.some((i) => i.product_type === 'physical');
    blocks.push(`<div class="act"><label class="small" for="ref">Zwrot pieniędzy (zł, maks. ${zl(left)})</label>
      <div class="act-row"><input type="number" id="ref" min="0.01" step="0.01" max="${(left / 100).toFixed(2)}" value="${(left / 100).toFixed(2)}"></div>
      ${physical ? '<label class="check"><input type="checkbox" id="restock" checked><span>Przy pełnym zwrocie oddaj towar na stan (nie wysłany albo odesłany przez klienta)</span></label>' : ''}
      <div class="act-row"><button class="btn btn-danger" data-act="refund" data-confirm="1">Zwróć pieniądze</button></div></div>`);
  }
  if (a.has('cancel')) blocks.push(`<div class="act"><div class="act-row"><button class="btn btn-danger" data-act="cancel" data-confirm="1">Anuluj zamówienie</button></div><p class="small">Towar wróci do sprzedaży.</p></div>`);
  blocks.push(`<div class="act"><label class="small" for="nt">Notatka wewnętrzna</label><textarea id="nt" rows="2"></textarea>
    <div class="act-row"><button class="btn" data-act="note" data-note="#nt">Dodaj notatkę</button></div></div>`);
  return `<section class="actions" aria-label="Akcje"><h2 class="h3">Co dalej</h2>${blocks.join('')}
    <label class="check"><input type="checkbox" id="no-mail"><span>Nie wysyłaj maila do klienta przy tej zmianie</span></label></section>`;
}

async function viewOrder(id) {
  const { order: o } = await api('GET', `/api/admin/orders/${id}`);
  if (!labels.zrealizowane) labels = (await api('GET', '/api/admin/summary')).labels;
  const ship = o.shipping;
  const bill = o.billing;
  main.innerHTML = `
    <p class="crumbs"><a href="#zamowienia">Zamówienia</a><span>/</span><span>${esc(o.number)}</span></p>
    <div class="adm-title"><h1 class="h2 mono" style="font-family:var(--f-mono);font-weight:500">${esc(o.number)}</h1>${pill(o.status)}</div>
    <div class="od">
      <div class="od-main">
        ${o.note ? `<p class="note"><b>Uwagi klienta:</b> ${esc(o.note)}</p>` : ''}
        <section>
          <h2 class="h3" style="margin-bottom:var(--s-3)">Produkty</h2>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produkt</th><th>Plik / projekt</th><th class="num">Ilość</th><th class="num">Cena</th><th class="num">Razem</th></tr></thead><tbody>
          ${o.items.map((i) => `<tr><td class="wrap-cell">${esc(i.name)}<br><span class="small mono">${esc(i.variant_label)} · ${esc(i.sku)}</span></td>
            <td>${i.project_status ? `${i.file_url ? `<a class="file-link" href="${esc(i.file_url)}">${esc(i.upload_name)}</a>` : '<span class="small low">brak pliku</span>'}<br><span class="small">${esc(PROJECT[i.project_status])}</span>` : '<span class="small">—</span>'}</td>
            <td class="num">${i.qty}</td><td class="num">${zl(i.unit_price_gr)}</td><td class="num">${zl(i.unit_price_gr * i.qty)}</td></tr>`).join('')}
          </tbody></table></div>
          <dl class="order-totals" style="margin-top:var(--s-3)">
            <dt>Produkty</dt><dd>${zl(o.totals.subtotal_gr)}</dd>
            ${o.totals.discount_gr ? `<dt>Rabat ${esc(o.totals.coupon_code ?? '')}</dt><dd>−${zl(o.totals.discount_gr)}</dd>` : ''}
            <dt>Dostawa</dt><dd>${zl(o.totals.shipping_gr)}</dd>
            <dt class="total">Razem</dt><dd class="total">${zl(o.totals.total_gr)}</dd>
            <dt>w tym VAT</dt><dd>${zl(o.totals.vat_gr)}</dd>
          </dl>
        </section>
        <section>
          <h2 class="h3" style="margin-bottom:var(--s-3)">Płatności</h2>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Próba</th><th>Operator</th><th>Status</th><th>Identyfikator</th><th class="num">Kwota</th><th class="num">Zwrócono</th></tr></thead><tbody>
          ${o.payments.map((p) => `<tr><td>${p.attempt}</td><td>${esc(PAY[p.provider] ?? p.provider)}</td><td>${esc(PAY_STATUS[p.status] ?? p.status)}</td>
            <td class="small mono">${esc(p.provider_order ?? p.provider_ref ?? '—')}</td><td class="num">${zl(p.amount_gr)}</td><td class="num">${p.refunded_gr ? zl(p.refunded_gr) : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Brak</td></tr>'}
          </tbody></table></div>
        </section>
        <section>
          <h2 class="h3" style="margin-bottom:var(--s-3)">Historia</h2>
          <ol class="timeline">${o.events.map((e) => `<li><span class="mono small">${dt(e.created_at)}</span><span>${pill(e.to_status)}<span class="src">${esc(SOURCE[e.source] ?? e.source)}</span>${e.note ? `<br><span class="small">${esc(e.note)}</span>` : ''}</span></li>`).join('')}</ol>
        </section>
      </div>
      <aside class="od-side">
        ${actionsPanel(o)}
        <div class="panel">
          <div><p class="eyebrow">Klient</p><dl class="kv">
            <dt>E-mail</dt><dd>${esc(o.email)}</dd>
            ${o.phone ? `<dt>Telefon</dt><dd class="mono">${esc(o.phone)}</dd>` : ''}
            <dt>Konto</dt><dd>${o.customer ? `tak · ${o.customer.orders} zam.` : 'zakup bez konta'}</dd>
            <dt>Złożone</dt><dd>${dt(o.created_at)}</dd>
          </dl></div>
          <div><p class="eyebrow">Dostawa</p><dl class="kv">
            <dt>Metoda</dt><dd>${esc(SHIP[o.shipping_method] ?? o.shipping_method)}</dd>
            ${o.locker_code ? `<dt>Paczkomat</dt><dd class="mono">${esc(o.locker_code)}</dd>` : ''}
            ${ship?.name ? `<dt>Odbiorca</dt><dd>${esc(ship.name)}</dd>` : ''}
            ${ship?.street ? `<dt>Adres</dt><dd>${esc(ship.street)}<br>${esc(ship.postcode)} ${esc(ship.city)}</dd>` : ''}
            ${o.shipments.map((s) => `<dt>Przesyłka</dt><dd><span class="mono">${esc(s.tracking_number ?? '—')}</span><br><span class="small">${esc(s.status_label ?? s.status)}${s.cod_gr ? ` · pobranie ${zl(s.cod_gr)}` : ''}</span>${s.tracking_number ? `<br><a class="small" href="https://inpost.pl/sledzenie-przesylek?number=${encodeURIComponent(s.tracking_number)}" target="_blank" rel="noopener">Śledzenie InPost</a>` : ''}</dd>`).join('')}
          </dl></div>
          <div><p class="eyebrow">Faktura</p>${bill ? `<dl class="kv"><dt>Firma</dt><dd>${esc(bill.company)}</dd><dt>NIP</dt><dd class="mono">${esc(bill.nip)}</dd><dt>Adres</dt><dd>${esc(bill.street)}<br>${esc(bill.postcode)} ${esc(bill.city)}</dd></dl>` : '<p class="small">Paragon (klient nie prosił o fakturę)</p>'}</div>
          <div><p class="eyebrow">Maile do klienta</p>${o.emails.length ? `<ul class="plain mail-log">${o.emails.map((m) => `<li><span class="small mono">${dt(m.created_at)}</span> ${esc(m.subject)}<br><span class="small ${m.status === 'blad' ? 'low' : ''}">${esc(m.to_email)} · ${esc({ wyslany: 'wysłany', blad: 'błąd', pominiety: 'nie wysłany — brak klucza Resend' }[m.status])}${m.error ? ` · ${esc(m.error)}` : ''}</span></li>`).join('')}</ul>` : '<p class="small">Jeszcze żadnego.</p>'}</div>
          <div><p class="eyebrow">Zgody</p><p class="small">Regulamin: ${dt(o.terms_accepted_at)}${o.digital_consent_at ? `<br>Treści cyfrowe od razu: ${dt(o.digital_consent_at)}` : ''}</p></div>
        </div>
      </aside>
    </div>`;

  main.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.confirm && !btn.dataset.armed) {
      // potwierdzenie w samej stronie (okna confirm() w przeglądarce bywają blokowane)
      btn.dataset.armed = '1';
      const original = btn.textContent;
      btn.textContent = `Na pewno? ${original}`;
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = original; } }, 4000);
      return;
    }
    const body = { action: btn.dataset.act };
    if (btn.dataset.note) body.note = document.querySelector(btn.dataset.note).value;
    if (btn.dataset.tracking) body.tracking_number = document.querySelector(btn.dataset.tracking).value;
    if (body.action === 'create_shipment') {
      if (document.getElementById('psize')) body.size = document.getElementById('psize').value;
      else Object.assign(body, { weight_kg: document.getElementById('pw').value, length_cm: document.getElementById('pl').value, width_cm: document.getElementById('pwd').value, height_cm: document.getElementById('ph').value });
    }
    if (body.action === 'refund') {
      body.amount_gr = Math.round(Number(String(document.getElementById('ref').value).replace(',', '.')) * 100);
      body.restock = !!document.getElementById('restock')?.checked;
    }
    main.querySelectorAll('[data-act]').forEach((b) => { b.disabled = true; });
    const quiet = document.getElementById('no-mail');
    if (quiet?.checked) body.notify = false;
    api('POST', `/api/admin/orders/${o.id}`, body)
      .then((r) => { toast(r.message); return viewOrder(o.id); })
      .catch((err) => { toast(err.message); main.querySelectorAll('[data-act]').forEach((b) => { b.disabled = false; }); });
  }));
}

// ───────────── Router i dostęp ─────────────

function gate(title, text, link) {
  nav.hidden = true;
  main.innerHTML = `<div class="gate panel"><h1 class="h2">${esc(title)}</h1><p>${text}</p>${link}</div>`;
}

async function render() {
  const route = location.hash.slice(1) || 'pulpit';
  nav.querySelectorAll('a').forEach((a) => {
    const on = route === a.dataset.sec || (a.dataset.sec === 'zamowienia' && route.startsWith('z-'))
      || (a.dataset.sec === 'produkty' && (route.startsWith('produkt-') || route === 'import'));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try {
    if (route === 'pulpit') await viewDashboard();
    else if (route === 'zamowienia') await viewOrders();
    else if (route.startsWith('z-')) await viewOrder(Number(route.slice(2)));
    else if (route === 'produkty') await viewProducts();
    else if (route === 'produkt-nowy') await viewProductEdit(null);
    else if (route.startsWith('produkt-')) await viewProductEdit(Number(route.slice(8)));
    else if (route === 'import') await viewImport();
    else location.hash = 'pulpit';
  } catch (err) {
    if (err.status === 401 || err.status === 403) return start();
    main.innerHTML = `<div class="empty"><p class="h3">Nie udało się wczytać danych.</p><p class="muted">${esc(err.message)}</p><button class="btn" type="button" id="reload">Odśwież</button></div>`;
    document.getElementById('reload').addEventListener('click', () => location.reload());
  }
  // kliknięcie w wiersz tabeli = przejście do szczegółów
  main.querySelectorAll('tr[data-href]').forEach((r) => r.addEventListener('click', (e) => { if (e.target.closest('a,button,input,label')) return; location.hash = r.dataset.href; }));
}

async function start() {
  let me = null;
  try { ({ customer: me } = await api('GET', '/api/auth/me')); } catch { /* brak API */ }
  if (!me) {
    userBox.innerHTML = '';
    return gate('Zaloguj się', 'Panel używa zwykłego konta sklepu. Zaloguj się kontem administratora i wróć tutaj.', '<a class="btn btn-primary" href="/#konto">Przejdź do logowania</a>');
  }
  userBox.innerHTML = `<span class="mono">${esc(me.email)}</span><a href="/" class="link-btn">Sklep</a><button type="button" class="link-btn" id="logout">Wyloguj</button>`;
  document.getElementById('logout').addEventListener('click', async () => { await api('POST', '/api/auth/logout'); location.href = '/'; });
  if (!me.is_admin) {
    return gate('Brak dostępu', `Konto <b>${esc(me.email)}</b> nie jest na liście administratorów. Dodaj ten adres do sekretu <code>ADMIN_EMAILS</code> w Cloudflare (Settings → Variables and Secrets) i wdroż ponownie.`, '<a class="btn" href="/">Wróć do sklepu</a>');
  }
  nav.hidden = false;
  render();
}

initProducts({ main, api, toast, esc, zl });
window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });
toastEl.addEventListener('click', () => { toastEl.hidden = true; });
start();
