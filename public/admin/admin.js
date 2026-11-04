// Panel admina PromoKuźni. Widoki: #pulpit, #zamowienia, #z-<id>, #produkty.
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
  if (!res.ok) { const e = new Error(data.error || `Błąd ${res.status}`); e.status = res.status; throw e; }
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
    <div class="act-row"><button class="btn" data-act="request_changes" data-note="#chg">Zapisz: projekt do poprawy</button></div></div>`);
  if (a.has('ship')) blocks.push(o.shipping_method === 'odbior'
    ? `<div class="act"><div class="act-row"><button class="btn btn-primary" data-act="ship">Gotowe do odbioru</button></div></div>`
    : `<div class="act"><label class="small" for="trk">Numer przesyłki ${o.locker_code ? `(Paczkomat <span class="mono">${esc(o.locker_code)}</span>)` : ''}</label>
      <div class="act-row"><input type="text" id="trk" placeholder="np. 520000012345678901234567" autocomplete="off"><button class="btn btn-primary" data-act="ship" data-tracking="#trk">Oznacz jako wysłane</button></div>
      <p class="small">Etykiety InPost z poziomu panelu dojdą w Etapie 5. Na razie wpisz numer z Managera Paczek.</p></div>`);
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
  return `<section class="actions" aria-label="Akcje"><h2 class="h3">Co dalej</h2>${blocks.join('')}</section>`;
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
            ${o.shipments.map((s) => `<dt>Przesyłka</dt><dd class="mono">${esc(s.tracking_number)}<br><span class="small">${esc(s.status)}</span></dd>`).join('')}
          </dl></div>
          <div><p class="eyebrow">Faktura</p>${bill ? `<dl class="kv"><dt>Firma</dt><dd>${esc(bill.company)}</dd><dt>NIP</dt><dd class="mono">${esc(bill.nip)}</dd><dt>Adres</dt><dd>${esc(bill.street)}<br>${esc(bill.postcode)} ${esc(bill.city)}</dd></dl>` : '<p class="small">Paragon (klient nie prosił o fakturę)</p>'}</div>
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
    if (body.action === 'refund') {
      body.amount_gr = Math.round(Number(String(document.getElementById('ref').value).replace(',', '.')) * 100);
      body.restock = !!document.getElementById('restock')?.checked;
    }
    main.querySelectorAll('[data-act]').forEach((b) => { b.disabled = true; });
    api('POST', `/api/admin/orders/${o.id}`, body)
      .then((r) => { toast(r.message); return viewOrder(o.id); })
      .catch((err) => { toast(err.message); main.querySelectorAll('[data-act]').forEach((b) => { b.disabled = false; }); });
  }));
}

// ───────────── Produkty ─────────────

async function viewProducts() {
  const { products } = await api('GET', '/api/admin/products');
  main.innerHTML = `
    <div class="adm-title"><h1 class="h2">Produkty</h1><span class="small">Zmiana ceny zapisuje się w historii cen — sklep sam policzy najniższą cenę z 30 dni.</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Wariant</th><th>SKU</th><th class="num">Cena (zł)</th><th class="num">Stan</th><th class="num">Rezerw.</th><th class="num">Sprzedano</th><th>W sklepie</th><th></th></tr></thead><tbody>
    ${products.map((p) => `<tr class="group ${p.active ? '' : 'off'}"><td colspan="6"><span class="prod-name">${esc(p.name)}</span> <span class="small">· ${esc(p.category)}</span></td>
        <td colspan="2"><label class="check"><input type="checkbox" data-product="${p.id}" ${p.active ? 'checked' : ''}><span>widoczny</span></label></td></tr>
      ${p.variants.map((v) => `<tr data-variant="${v.id}" class="${v.active && p.active ? '' : 'off'}">
        <td>${esc(v.label)}</td><td class="mono small">${esc(v.sku)}</td>
        <td class="num"><input class="mini" type="number" step="0.01" min="1" data-field="price" value="${(v.price_gr / 100).toFixed(2)}" aria-label="Cena ${esc(p.name)} ${esc(v.label)}"></td>
        <td class="num">${v.stock === null ? '<span class="small">bez limitu</span>' : `<input class="mini" type="number" step="1" min="${v.reserved}" data-field="stock" value="${v.stock}" aria-label="Stan ${esc(p.name)} ${esc(v.label)}">`}</td>
        <td class="num">${v.reserved || '—'}</td><td class="num">${v.sold || '—'}</td>
        <td><label class="check"><input type="checkbox" data-field="active" ${v.active ? 'checked' : ''}><span>aktywny</span></label></td>
        <td><button class="btn" type="button" data-save hidden>Zapisz</button></td></tr>`).join('')}`).join('')}
    </tbody></table></div>`;

  main.querySelectorAll('tr[data-variant]').forEach((row) => {
    const save = row.querySelector('[data-save]');
    row.querySelectorAll('input.mini').forEach((i) => i.addEventListener('input', () => { i.dataset.dirty = '1'; save.hidden = false; }));
    row.querySelector('[data-field="active"]').addEventListener('change', (e) => {
      api('PATCH', `/api/admin/variants/${row.dataset.variant}`, { active: e.target.checked })
        .then((r) => { toast(r.message); row.classList.toggle('off', !e.target.checked); })
        .catch((err) => { toast(err.message); e.target.checked = !e.target.checked; });
    });
    save.addEventListener('click', () => {
      const body = {};
      const price = row.querySelector('[data-field="price"]');
      const stock = row.querySelector('[data-field="stock"]');
      if (price.dataset.dirty) body.price_gr = Math.round(Number(price.value.replace(',', '.')) * 100);
      if (stock?.dataset.dirty) body.stock = Number(stock.value);
      save.disabled = true;
      api('PATCH', `/api/admin/variants/${row.dataset.variant}`, body).then((r) => {
        toast(r.message);
        row.querySelectorAll('[data-dirty]').forEach((i) => delete i.dataset.dirty);
        save.hidden = true;
      }).catch((err) => toast(err.message)).finally(() => { save.disabled = false; });
    });
  });
  main.querySelectorAll('[data-product]').forEach((c) => c.addEventListener('change', () => {
    api('PATCH', `/api/admin/products/${c.dataset.product}`, { active: c.checked })
      .then((r) => { toast(r.message); viewProducts(); })
      .catch((err) => { toast(err.message); c.checked = !c.checked; });
  }));
  main.querySelectorAll('tr[data-href]').forEach((r) => r.addEventListener('click', () => { location.hash = r.dataset.href; }));
}

// ───────────── Router i dostęp ─────────────

function gate(title, text, link) {
  nav.hidden = true;
  main.innerHTML = `<div class="gate panel"><h1 class="h2">${esc(title)}</h1><p>${text}</p>${link}</div>`;
}

async function render() {
  const route = location.hash.slice(1) || 'pulpit';
  nav.querySelectorAll('a').forEach((a) => {
    const on = route === a.dataset.sec || (a.dataset.sec === 'zamowienia' && route.startsWith('z-'));
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try {
    if (route === 'pulpit') await viewDashboard();
    else if (route === 'zamowienia') await viewOrders();
    else if (route.startsWith('z-')) await viewOrder(Number(route.slice(2)));
    else if (route === 'produkty') await viewProducts();
    else location.hash = 'pulpit';
  } catch (err) {
    if (err.status === 401 || err.status === 403) return start();
    main.innerHTML = `<div class="empty"><p class="h3">Nie udało się wczytać danych.</p><p class="muted">${esc(err.message)}</p><button class="btn" type="button" onclick="location.reload()">Odśwież</button></div>`;
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

window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });
toastEl.addEventListener('click', () => { toastEl.hidden = true; });
start();
