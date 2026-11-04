// Panel → Promocje: kody rabatowe i promocje cenowe na produkty.
let h; // { main, api, toast, esc, zl }
export function initPromos(helpers) { h = helpers; }

const KIND = { procent: 'Procent', kwota: 'Kwota (zł)', darmowa_dostawa: 'Darmowa dostawa' };
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const endOfDay = (d) => (d ? `${d}T23:59:59+01:00` : null);
const zlToGr = (v) => { const s = String(v ?? '').trim().replace(',', '.'); return s === '' ? 0 : Math.round(Number(s) * 100); };
const randomCode = () => `PK-${Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')}`;

function couponLabel(c, zl) {
  if (c.kind === 'procent') return `−${c.value}%`;
  if (c.kind === 'kwota') return `−${zl(c.value)}`;
  return 'darmowa dostawa';
}
function couponState(c) {
  if (!c.active) return ['off', 'wyłączony'];
  if (c.valid_until && Date.parse(c.valid_until) < Date.now()) return ['off', 'wygasł'];
  if (c.max_uses !== null && c.used >= c.max_uses) return ['off', 'wykorzystany'];
  return ['on', 'działa'];
}

export async function viewPromos() {
  const { main, api, toast, esc, zl } = h;
  const [{ coupons }, { promotions }, { products }] = await Promise.all([
    api('GET', '/api/admin/coupons'), api('GET', '/api/admin/promotions'), api('GET', '/api/admin/products')
  ]);
  const open = promotions.filter((p) => !p.ended_at);
  const ended = promotions.filter((p) => p.ended_at).slice(0, 10);
  const busy = new Set(open.map((p) => p.product_id));
  const choosable = products.filter((p) => p.active && !busy.has(p.id) && p.variants.some((v) => v.active));

  main.innerHTML = `
    <div class="adm-title"><h1 class="h2">Promocje</h1><span class="small">Kody rabatowe klient wpisuje w koszyku. Promocje na produkty obniżają ceny od razu, z przekreśloną ceną i najniższą ceną z 30 dni (Omnibus).</span></div>

    <section class="pf-card promo-block">
      <div class="pf-head"><h2 class="h3">Kody rabatowe</h2><span class="small mono">${coupons.length}</span></div>
      <form class="coupon-form" id="coupon-form" novalidate>
        <label class="f">Kod<span class="code-row"><input name="code" maxlength="24" class="mono" placeholder="np. LATO20" autocomplete="off" required><button class="btn" type="button" id="gen-code">Losuj</button></span></label>
        <label class="f">Rodzaj<select name="kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="f" id="value-field"><span style="white-space:nowrap">Wartość (<span id="value-unit">%</span>)</span><input name="value" inputmode="decimal" placeholder="10"></label>
        <label class="f">Min. koszyk (zł)<input name="min" inputmode="decimal" placeholder="0"></label>
        <label class="f">Limit użyć<input name="max_uses" type="number" min="1" placeholder="bez limitu"></label>
        <label class="f">Ważny do<input name="valid_until" type="date"></label>
        <button class="btn btn-primary" type="submit">Dodaj kod</button>
      </form>
      <p class="pf-errors" id="coupon-err" hidden></p>
      ${coupons.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kod</th><th>Rabat</th><th class="num">Min. koszyk</th><th class="num">Użycia</th><th>Ważny do</th><th class="num">Rabaty łącznie</th><th>Stan</th><th></th></tr></thead><tbody>
        ${coupons.map((c) => { const [st, label] = couponState(c); return `<tr data-coupon="${c.id}" class="${st === 'off' ? 'off' : ''}">
          <td class="mono"><b>${esc(c.code)}</b> <button type="button" class="link-btn" data-copy="${esc(c.code)}" aria-label="Kopiuj kod ${esc(c.code)}">kopiuj</button></td>
          <td>${couponLabel(c, zl)}</td><td class="num">${c.min_total_gr ? zl(c.min_total_gr) : '—'}</td>
          <td class="num">${c.used}${c.max_uses ? ` / ${c.max_uses}` : ''}</td><td>${day(c.valid_until)}</td>
          <td class="num">${c.discount_total_gr ? zl(c.discount_total_gr) : '—'}</td>
          <td><label class="check"><input type="checkbox" data-toggle ${c.active ? 'checked' : ''}><span>${label}</span></label></td>
          <td>${c.used ? '' : '<button type="button" class="link-btn" data-del>Usuń</button>'}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">Nie ma jeszcze kodów.</p>'}
    </section>

    <section class="pf-card promo-block">
      <div class="pf-head"><h2 class="h3">Promocje na produkty</h2><span class="small">trwające: ${open.length}</span></div>
      ${choosable.length ? `<form class="promo-form" id="promo-form" novalidate>
        <label class="f">Produkt<select name="product_id">${choosable.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
        <label class="f">Rabat (%)<input name="percent" type="number" min="1" max="90" value="15"></label>
        <label class="f">Do kiedy<input name="ends_at" type="date"><small class="muted">puste = do odwołania</small></label>
        <label class="f">Etykieta <small class="muted">opcjonalnie</small><input name="label" maxlength="40" placeholder="np. Black Week"></label>
        <button class="btn btn-primary" type="submit">Uruchom promocję</button>
      </form>
      <div class="promo-preview" id="promo-preview"></div>` : '<p class="muted">Wszystkie widoczne produkty mają już promocję.</p>'}
      ${open.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Produkt</th><th>Rabat</th><th>Od</th><th>Do</th><th></th></tr></thead><tbody>
        ${open.map((p) => `<tr><td class="wrap-cell"><b>${esc(p.name)}</b>${p.label ? ` <span class="badge-mini">${esc(p.label)}</span>` : ''} <a class="small" href="/#p-${esc(p.slug)}" target="_blank" rel="noopener">w sklepie ↗</a></td>
          <td><b>−${p.percent}%</b></td><td>${day(p.created_at)}</td><td>${p.ends_at ? day(p.ends_at) : 'do odwołania'}</td>
          <td><button class="btn btn-danger" type="button" data-end="${p.id}">Zakończ</button></td></tr>`).join('')}
      </tbody></table></div>` : ''}
      ${ended.length ? `<details class="promo-history"><summary>Zakończone (${ended.length})</summary><ul class="plain">${ended.map((p) => `<li><b>${esc(p.name)}</b> −${p.percent}% · ${day(p.created_at)} – ${day(p.ended_at)}</li>`).join('')}</ul></details>` : ''}
    </section>`;

  // ── kody ──
  const cf = document.getElementById('coupon-form');
  const err = document.getElementById('coupon-err');
  const syncKind = () => {
    const k = cf.kind.value;
    document.getElementById('value-field').hidden = k === 'darmowa_dostawa';
    document.getElementById('value-unit').textContent = k === 'kwota' ? 'zł' : '%';
  };
  cf.kind.addEventListener('change', syncKind);
  syncKind();
  document.getElementById('gen-code').addEventListener('click', () => { cf.code.value = randomCode(); });
  cf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = cf.querySelector('[type=submit]');
    const kind = cf.kind.value;
    const raw = String(cf.value.value).replace(',', '.');
    const body = {
      code: cf.code.value, kind,
      value: kind === 'kwota' ? zlToGr(raw) : kind === 'procent' ? Number(raw) : 0,
      min_total_gr: zlToGr(cf.min.value), max_uses: cf.max_uses.value || null, valid_until: cf.valid_until.value || null
    };
    btn.disabled = true; err.hidden = true;
    try { const r = await api('POST', '/api/admin/coupons', body); toast(r.message); viewPromos(); }
    catch (x) { err.textContent = (x.data?.errors ?? [x.message]).join(' '); err.hidden = false; btn.disabled = false; }
  });
  main.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    navigator.clipboard?.writeText(b.dataset.copy).then(() => toast(`Skopiowano ${b.dataset.copy}`), () => {});
  }));
  main.querySelectorAll('tr[data-coupon]').forEach((tr) => {
    const id = tr.dataset.coupon;
    tr.querySelector('[data-toggle]').addEventListener('change', (e) => {
      api('PATCH', `/api/admin/coupons/${id}`, { active: e.target.checked }).then((r) => { toast(r.message); viewPromos(); })
        .catch((x) => { toast(x.message); e.target.checked = !e.target.checked; });
    });
    tr.querySelector('[data-del]')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Na pewno?'; return; }
      api('DELETE', `/api/admin/coupons/${id}`).then((r) => { toast(r.message); viewPromos(); }).catch((x) => toast(x.message));
    });
  });

  // ── promocje ──
  const pf = document.getElementById('promo-form');
  if (pf) {
    const preview = () => {
      const p = choosable.find((x) => x.id === Number(pf.product_id.value));
      const pct = Math.round(Number(pf.percent.value));
      const box = document.getElementById('promo-preview');
      if (!p || !(pct >= 1 && pct <= 90)) { box.innerHTML = '<p class="small">Rabat od 1 do 90%.</p>'; return; }
      box.innerHTML = `<p class="small">Nowe ceny:</p><ul class="promo-prices">${p.variants.filter((v) => v.active).map((v) => {
        const np = Math.max(100, Math.round((v.price_gr * (100 - pct)) / 100));
        return `<li><span>${esc(v.label)}</span><s>${zl(v.price_gr)}</s><b>${zl(np)}</b></li>`;
      }).join('')}</ul>`;
    };
    pf.addEventListener('input', preview);
    preview();
    pf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = pf.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const r = await api('POST', '/api/admin/promotions', {
          product_id: Number(pf.product_id.value), percent: Number(pf.percent.value), ends_at: endOfDay(pf.ends_at.value), label: pf.label.value.trim() || null
        });
        toast(r.message); viewPromos();
      } catch (x) { toast(x.message); btn.disabled = false; }
    });
  }
  main.querySelectorAll('[data-end]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Potwierdź'; return; }
    b.disabled = true;
    api('DELETE', `/api/admin/promotions/${b.dataset.end}`).then((r) => { toast(r.message); viewPromos(); }).catch((x) => { toast(x.message); b.disabled = false; });
  }));
}
