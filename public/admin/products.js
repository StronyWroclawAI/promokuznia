// Panel → Produkty: lista ze stanami, formularz produktu (dodawanie i edycja), import i eksport Excela.
import { templateXlsx, exportXlsx, rowsToProducts, pickSheet, slugify } from './sheet.js';
import { readXlsx, readCsv } from './xlsx.js';

let h; // pomocnicze funkcje z admin.js: { main, api, toast, esc, zl }
export function initProducts(helpers) { h = helpers; }

const TYPES = { physical: 'Fizyczny (wysyłka)', digital: 'Cyfrowy (do pobrania)', service: 'Usługa', gift_card: 'Karta podarunkowa' };
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const today = () => new Date().toISOString().slice(0, 10);
let categoriesCache = null;
const categories = async () => (categoriesCache ??= (await h.api('GET', '/api/categories')).categories);

function download(bytes, name, type = XLSX_MIME) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function downloadTemplate() {
  download(templateXlsx(await categories()), 'promokuznia-szablon-produktow.xlsx');
}
export async function downloadCatalog(btn) {
  if (btn) btn.disabled = true;
  try {
    const [{ products }, cats] = await Promise.all([h.api('GET', '/api/admin/products/export'), categories()]);
    download(exportXlsx(products, cats), `promokuznia-katalog-${today()}.xlsx`);
    h.toast(`Pobrano katalog: ${products.length} produktów.`);
  } catch (err) { h.toast(err.message); } finally { if (btn) btn.disabled = false; }
}

const toolButtons = () => `<div class="prod-tools">
  <a class="btn btn-primary" href="#produkt-nowy">+ Dodaj produkt</a>
  <a class="btn" href="#import">Import z Excela</a>
  <button class="btn" type="button" data-dl="template">Pobierz szablon .xlsx</button>
  <button class="btn" type="button" data-dl="catalog">Eksportuj katalog .xlsx</button>
</div>`;
function bindToolButtons() {
  h.main.querySelector('[data-dl="template"]')?.addEventListener('click', () => downloadTemplate().catch((e) => h.toast(e.message)));
  h.main.querySelector('[data-dl="catalog"]')?.addEventListener('click', (e) => downloadCatalog(e.currentTarget));
}

// ───────────── Lista ─────────────

export async function viewProducts() {
  const { esc, zl, api, toast, main } = h;
  const { products } = await api('GET', '/api/admin/products');
  main.innerHTML = `
    <div class="adm-title"><h1 class="h2">Produkty <span class="small mono">${products.length}</span></h1>${toolButtons()}</div>
    <p class="small" style="margin:0 0 var(--s-4)">Cenę i stan zmienisz od razu w tabeli. Zmiana ceny trafia do historii cen — sklep sam policzy najniższą cenę z 30 dni.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Wariant</th><th>SKU</th><th class="num">Cena (zł)</th><th class="num">Stan</th><th class="num">Rezerw.</th><th class="num">Sprzedano</th><th>W sklepie</th><th></th></tr></thead><tbody>
    ${products.map((p) => `<tr class="group ${p.active ? '' : 'off'}"><td colspan="6"><div class="prod-head">
          <span class="prod-thumb">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ''}</span>
          <span><a class="prod-name" href="#produkt-${p.id}">${esc(p.name)}</a> <span class="small">· ${esc(p.category)}</span></span>
          <a class="link-btn" href="#produkt-${p.id}">Edytuj</a><a class="link-btn" href="/#p-${esc(p.slug)}" target="_blank" rel="noopener">W sklepie ↗</a></div></td>
        <td colspan="2"><label class="check"><input type="checkbox" data-product="${p.id}" ${p.active ? 'checked' : ''}><span>widoczny</span></label></td></tr>
      ${p.variants.map((v) => `<tr data-variant="${v.id}" class="${v.active && p.active ? '' : 'off'}">
        <td>${esc(v.label)}</td><td class="mono small">${esc(v.sku)}</td>
        <td class="num"><input class="mini" type="number" step="0.01" min="1" data-field="price" value="${(v.price_gr / 100).toFixed(2)}" aria-label="Cena ${esc(p.name)} ${esc(v.label)}"></td>
        <td class="num">${v.stock === null ? '<span class="small">bez limitu</span>' : `<input class="mini" type="number" step="1" min="${v.reserved}" data-field="stock" value="${v.stock}" aria-label="Stan ${esc(p.name)} ${esc(v.label)}">`}</td>
        <td class="num">${v.reserved || '—'}</td><td class="num">${v.sold || '—'}</td>
        <td><label class="check"><input type="checkbox" data-field="active" ${v.active ? 'checked' : ''}><span>aktywny</span></label></td>
        <td><button class="btn" type="button" data-save hidden>Zapisz</button></td></tr>`).join('')}`).join('')}
    </tbody></table></div>`;
  bindToolButtons();

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
}

// ───────────── Formularz produktu ─────────────

const EMPTY = {
  id: null, slug: '', name: '', category: '', type: 'physical', short: '', description: '', vat_rate: 23,
  personalizable: false, lead_time_days: 3, weight_g: 500, dims_cm: null, shipping_class: 'paczkomat', parcel_size: 'A',
  specs: [], badges: [], compare_at_gr: null, active: true, images: [],
  variants: [{ label: 'Standard', sku: '', price_gr: null, stock: null, active: true }]
};

const gr = (v) => { const s = String(v ?? '').trim().replace(',', '.'); return s === '' ? null : Math.round(Number(s) * 100); };
const zlInput = (g) => (g === null || g === undefined ? '' : (g / 100).toFixed(2));

export async function viewProductEdit(id) {
  const { esc, api, toast, main } = h;
  const cats = await categories();
  const p = id ? structuredClone((await api('GET', `/api/admin/products/${id}`)).product) : structuredClone({ ...EMPTY, category: cats[0]?.slug ?? '' });
  const isNew = !p.id;
  let slugTouched = !isNew;

  main.innerHTML = `
    <div class="crumbs" style="margin-bottom:var(--s-3)"><a href="#produkty">Produkty</a><span>/</span><span>${isNew ? 'Nowy produkt' : esc(p.name)}</span></div>
    <div class="adm-title"><h1 class="h2">${isNew ? 'Nowy produkt' : esc(p.name)}</h1>${isNew ? '' : `<a class="link-btn" href="/#p-${esc(p.slug)}" target="_blank" rel="noopener">Zobacz w sklepie ↗</a>`}</div>
    <form class="pf" id="pf" novalidate>
      <div class="pf-main">
        <section class="pf-card"><h2 class="h3">Podstawy</h2>
          <div class="pf-grid two">
            <label class="f">Nazwa produktu *<input name="name" required maxlength="120" value="${esc(p.name)}"></label>
            <label class="f">Adres w sklepie (slug)<input name="slug" maxlength="80" value="${esc(p.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" class="mono" placeholder="tworzy się z nazwy"><small class="muted">sklep/#p-<span id="slug-prev">${esc(p.slug || '…')}</span></small></label>
            <label class="f">Kategoria *<select name="category">${cats.map((c) => `<option value="${esc(c.slug)}" ${c.slug === p.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            <label class="f">Typ *<select name="type">${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${k === p.type ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          </div>
          <label class="f">Opis krótki <small class="muted">— na karcie produktu w liście, do 300 znaków</small><input name="short" maxlength="300" value="${esc(p.short)}"></label>
          <label class="f">Opis<textarea name="description" rows="6" maxlength="5000">${esc(p.description)}</textarea></label>
        </section>

        <section class="pf-card"><div class="pf-head"><h2 class="h3">Warianty i ceny</h2><button class="btn" type="button" id="add-variant">+ Wariant</button></div>
          <p class="small">Nakład, rozmiar albo kolor. Puste pole stanu = bez limitu. Wariantu nie da się usunąć, jeśli jest w zamówieniach — odznacz „aktywny”.</p>
          <div class="tbl-wrap"><table class="tbl pf-variants"><thead><tr><th>Nazwa wariantu *</th><th>SKU</th><th class="num">Cena brutto (zł) *</th><th class="num">Stan</th><th>Aktywny</th><th></th></tr></thead><tbody id="variants"></tbody></table></div>
          <div class="pf-grid three">
            <label class="f">VAT<select name="vat_rate">${[23, 8, 5, 0].map((v) => `<option value="${v}" ${p.vat_rate === v ? 'selected' : ''}>${v}%</option>`).join('')}<option value="" ${p.vat_rate === null ? 'selected' : ''}>zw. (karta podarunkowa)</option></select></label>
            <label class="f">Cena przed obniżką (zł)<input name="compare_at" inputmode="decimal" value="${zlInput(p.compare_at_gr)}" placeholder="bez promocji"></label>
            <label class="f">Etykiety <small class="muted">po przecinku</small><input name="badges" value="${esc(p.badges.join(', '))}" placeholder="Nowość, Bestseller"></label>
          </div>
        </section>

        <section class="pf-card"><div class="pf-head"><h2 class="h3">Zdjęcia</h2><span class="small">pierwsze jest główne · do 8</span></div>
          <div class="pf-images" id="images"></div>
          <div class="pf-add-img">
            <label class="btn file-btn">Wgraj zdjęcia<input type="file" id="img-file" accept="image/jpeg,image/png,image/webp,image/avif" multiple></label>
            <div class="pf-url"><label class="sr-only" for="img-url">Adres URL zdjęcia</label><input id="img-url" type="url" placeholder="albo wklej adres https://… zdjęcia"><button class="btn" type="button" id="img-url-add">Dodaj</button></div>
          </div>
          <p class="small" id="img-status">JPG, PNG, WebP lub AVIF do 8 MB. Zdjęcia trafiają do magazynu plików R2.</p>
        </section>

        <section class="pf-card"><h2 class="h3">Specyfikacja</h2>
          <label class="f">Jedna cecha w linii: <span class="mono">Cecha: wartość</span><textarea name="specs" rows="5" class="mono" placeholder="Pojemność: 330 ml&#10;Materiał: ceramika">${esc(p.specs.map(([k, v]) => `${k}: ${v}`).join('\n'))}</textarea></label>
        </section>
      </div>

      <aside class="pf-side">
        <section class="pf-card"><h2 class="h3">Widoczność</h2>
          <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><span>Widoczny w sklepie</span></label>
          <label class="check"><input type="checkbox" name="personalizable" ${p.personalizable ? 'checked' : ''}><span>Personalizacja — klient wgrywa plik z logo, sklep wysyła podgląd</span></label>
          <label class="f">Czas realizacji (dni robocze)<input name="lead_time_days" type="number" min="0" max="90" value="${p.lead_time_days ?? 0}"></label>
        </section>
        <section class="pf-card" id="ship-card"><h2 class="h3">Wysyłka</h2>
          <label class="f">Waga przesyłki (g) *<input name="weight_g" type="number" min="1" max="30000" value="${p.weight_g ?? ''}"></label>
          <div class="f"><span>Wymiary paczki (cm)</span><div class="dims3">${[0, 1, 2].map((i) => `<input name="dim${i}" type="number" min="1" max="300" aria-label="${['Długość', 'Szerokość', 'Wysokość'][i]}" placeholder="${['dł.', 'szer.', 'wys.'][i]}" value="${p.dims_cm?.[i] ?? ''}">`).join('<span>×</span>')}</div></div>
          <label class="f">Sposób wysyłki<select name="shipping_class"><option value="paczkomat" ${p.shipping_class !== 'kurier' ? 'selected' : ''}>Paczkomat i kurier</option><option value="kurier" ${p.shipping_class === 'kurier' ? 'selected' : ''}>Tylko kurier (duży gabaryt)</option></select></label>
          <label class="f">Gabaryt Paczkomatu<select name="parcel_size">${['A', 'B', 'C'].map((s) => `<option ${p.parcel_size === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        </section>
        <div class="pf-errors" id="pf-errors" role="alert" hidden></div>
        <div class="pf-save"><button class="btn btn-primary" type="submit" id="pf-submit">${isNew ? 'Dodaj produkt' : 'Zapisz zmiany'}</button><a class="btn" href="#produkty">Anuluj</a></div>
      </aside>
    </form>`;

  const form = document.getElementById('pf');
  const vBody = document.getElementById('variants');
  const imgBox = document.getElementById('images');
  const errBox = document.getElementById('pf-errors');
  const status = document.getElementById('img-status');

  const syncSlug = () => { document.getElementById('slug-prev').textContent = form.slug.value || slugify(form.name.value) || '…'; };
  form.name.addEventListener('input', () => { if (!slugTouched) form.slug.value = slugify(form.name.value); syncSlug(); });
  form.slug.addEventListener('input', () => { slugTouched = true; syncSlug(); });
  const syncType = () => { document.getElementById('ship-card').hidden = form.type.value !== 'physical'; };
  form.type.addEventListener('change', syncType);
  syncType();

  // warianty — stan w tablicy, tabela renderowana od nowa po każdej zmianie struktury
  const readVariants = () => [...vBody.querySelectorAll('tr')].forEach((tr, i) => {
    const v = p.variants[i];
    v.label = tr.querySelector('[data-v=label]').value;
    v.sku = tr.querySelector('[data-v=sku]').value.trim().toUpperCase();
    v.price_gr = gr(tr.querySelector('[data-v=price]').value);
    const s = tr.querySelector('[data-v=stock]').value.trim();
    v.stock = s === '' ? null : Number(s);
    v.active = tr.querySelector('[data-v=active]').checked;
  });
  const drawVariants = () => {
    vBody.innerHTML = p.variants.map((v, i) => `<tr class="${v.active === false ? 'off' : ''}">
      <td><input data-v="label" value="${esc(v.label)}" maxlength="80" aria-label="Nazwa wariantu ${i + 1}" placeholder="np. 100 szt."></td>
      <td><input data-v="sku" value="${esc(v.sku)}" maxlength="40" class="mono" aria-label="SKU wariantu ${i + 1}" placeholder="auto" ${v.id ? 'readonly title="SKU istniejącego wariantu się nie zmienia"' : ''}></td>
      <td class="num"><input data-v="price" inputmode="decimal" value="${zlInput(v.price_gr)}" class="mini" aria-label="Cena wariantu ${i + 1}"></td>
      <td class="num"><input data-v="stock" type="number" min="${v.reserved ?? 0}" value="${v.stock ?? ''}" class="mini" placeholder="∞" aria-label="Stan wariantu ${i + 1}"></td>
      <td><input data-v="active" type="checkbox" ${v.active !== false ? 'checked' : ''} aria-label="Wariant ${i + 1} aktywny"></td>
      <td>${v.id ? (v.reserved ? `<span class="small">${v.reserved} rez.</span>` : '') : `<button class="link-btn" type="button" data-del="${i}" ${p.variants.length < 2 ? 'disabled' : ''}>Usuń</button>`}</td></tr>`).join('');
    vBody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { readVariants(); p.variants.splice(Number(b.dataset.del), 1); drawVariants(); }));
  };
  document.getElementById('add-variant').addEventListener('click', () => {
    readVariants();
    if (p.variants.length >= 30) return toast('Maksymalnie 30 wariantów.');
    p.variants.push({ label: '', sku: '', price_gr: p.variants.at(-1)?.price_gr ?? null, stock: null, active: true });
    drawVariants();
    vBody.querySelector('tr:last-child [data-v=label]').focus();
  });
  drawVariants();

  // zdjęcia
  const drawImages = () => {
    imgBox.innerHTML = p.images.length ? p.images.map((im, i) => `<figure class="pf-img ${i === 0 ? 'main' : ''}">
      <img src="${esc(im.src)}" alt="" loading="lazy">
      ${i === 0 ? '<span class="pf-img-tag">Główne</span>' : ''}
      <input data-alt="${i}" value="${esc(im.alt)}" maxlength="160" placeholder="Opis zdjęcia (alt)" aria-label="Opis zdjęcia ${i + 1}">
      <div class="pf-img-tools">
        <button type="button" data-move="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Przesuń w lewo">←</button>
        <button type="button" data-move="${i}:1" ${i === p.images.length - 1 ? 'disabled' : ''} aria-label="Przesuń w prawo">→</button>
        <button type="button" data-rm="${i}" aria-label="Usuń zdjęcie">Usuń</button>
      </div></figure>`).join('') : '<p class="muted pf-noimg">Brak zdjęć — w sklepie pokaże się ilustracja zastępcza.</p>';
    imgBox.querySelectorAll('[data-alt]').forEach((i) => i.addEventListener('input', () => { p.images[Number(i.dataset.alt)].alt = i.value; }));
    imgBox.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
      const [i, d] = b.dataset.move.split(':').map(Number);
      [p.images[i], p.images[i + d]] = [p.images[i + d], p.images[i]];
      drawImages();
    }));
    imgBox.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { p.images.splice(Number(b.dataset.rm), 1); drawImages(); }));
  };
  drawImages();
  document.getElementById('img-file').addEventListener('change', async (e) => {
    const files = [...e.target.files].slice(0, Math.max(0, 8 - p.images.length));
    e.target.value = '';
    if (!files.length) return toast('Limit 8 zdjęć na produkt.');
    for (const [n, file] of files.entries()) {
      status.textContent = `Wgrywam ${n + 1} z ${files.length}: ${file.name}…`;
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await fetch('/api/admin/images', { method: 'POST', body: fd, credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Błąd ${res.status}`);
        p.images.push({ ...data.image, alt: form.name.value || file.name.replace(/\.\w+$/, '') });
        drawImages();
      } catch (err) { toast(`${file.name}: ${err.message}`); }
    }
    status.textContent = 'Gotowe. Zapisz produkt, żeby zdjęcia pojawiły się w sklepie.';
  });
  const addUrl = () => {
    const input = document.getElementById('img-url');
    const src = input.value.trim();
    if (!/^https:\/\/\S+$/i.test(src)) return toast('Adres zdjęcia musi zaczynać się od https://');
    if (p.images.length >= 8) return toast('Limit 8 zdjęć na produkt.');
    p.images.push({ src, alt: form.name.value, r2_key: '' });
    input.value = '';
    drawImages();
  };
  document.getElementById('img-url-add').addEventListener('click', addUrl);
  document.getElementById('img-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    readVariants();
    const f = form.elements;
    const dims = [0, 1, 2].map((i) => f[`dim${i}`].value.trim());
    const body = {
      id: p.id, slug: f.slug.value.trim() || slugify(f.name.value), name: f.name.value, category: f.category.value, type: f.type.value,
      short: f.short.value, description: f.description.value,
      vat_rate: f.vat_rate.value === '' ? null : Number(f.vat_rate.value),
      compare_at_gr: gr(f.compare_at.value), badges: f.badges.value.split(',').map((s) => s.trim()).filter(Boolean),
      active: f.active.checked, personalizable: f.personalizable.checked, lead_time_days: Number(f.lead_time_days.value || 0),
      weight_g: f.weight_g.value === '' ? null : Number(f.weight_g.value),
      dims_cm: dims.some(Boolean) ? dims.map(Number) : null,
      shipping_class: f.shipping_class.value, parcel_size: f.parcel_size.value,
      specs: f.specs.value.split('\n').map((l) => { const i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(Boolean),
      images: p.images, variants: p.variants.map(({ label, sku, price_gr, stock, active }) => ({ label, sku, price_gr, stock, active }))
    };
    const btn = document.getElementById('pf-submit');
    btn.disabled = true;
    errBox.hidden = true;
    try {
      const r = await api('POST', '/api/admin/products', body);
      toast(r.message);
      if (isNew) location.hash = `produkt-${r.product.id}`; else viewProductEdit(r.product.id);
    } catch (err) {
      const list = err.data?.errors ?? [err.message];
      errBox.innerHTML = `<p><b>Nie zapisano:</b></p><ul>${list.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
      errBox.hidden = false;
      errBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } finally { btn.disabled = false; }
  });
}

// ───────────── Import z Excela ─────────────

const CHUNK = 25;
async function inChunks(list, fn, onProgress) {
  const out = [];
  for (let i = 0; i < list.length; i += CHUNK) {
    const part = list.slice(i, i + CHUNK);
    const { results } = await fn(part);
    out.push(...results.map((r) => ({ ...r, i: r.i + i })));
    onProgress?.(Math.min(list.length, i + CHUNK), list.length);
  }
  return out;
}

export async function viewImport() {
  const { esc, api, toast, main } = h;
  const cats = await categories();
  main.innerHTML = `
    <div class="crumbs" style="margin-bottom:var(--s-3)"><a href="#produkty">Produkty</a><span>/</span><span>Import</span></div>
    <div class="adm-title"><h1 class="h2">Import produktów z Excela</h1></div>
    <ol class="imp-steps">
      <li class="pf-card"><span class="eyebrow">Krok 1</span><h2 class="h3">Pobierz szablon</h2>
        <p class="small">Arkusz „Produkty” z listami rozwijanymi, przykład wypełnienia i instrukcja kolumn. Chcesz zmienić istniejące produkty? Pobierz katalog — to ten sam układ.</p>
        <div class="act-row"><button class="btn btn-primary" type="button" data-dl="template">Szablon .xlsx</button><button class="btn" type="button" data-dl="catalog">Obecny katalog .xlsx</button></div></li>
      <li class="pf-card"><span class="eyebrow">Krok 2</span><h2 class="h3">Uzupełnij w Excelu</h2>
        <p class="small">Jeden wiersz = jeden wariant. Wymagane: nazwa, kategoria, typ, wariant, cena. Zdjęcia — adresy https:// po średniku. Działa też LibreOffice i Arkusze Google (Pobierz → .xlsx).</p></li>
      <li class="pf-card"><span class="eyebrow">Krok 3</span><h2 class="h3">Wczytaj plik</h2>
        <label class="drop" id="drop"><input type="file" id="imp-file" accept=".xlsx,.csv,${XLSX_MIME},text/csv"><span><b>Wybierz plik</b> albo upuść go tutaj</span><small class="muted">.xlsx lub .csv · nic nie zapisze się bez Twojego potwierdzenia</small></label></li>
    </ol>
    <div id="imp-result"></div>`;
  main.querySelector('[data-dl="template"]').addEventListener('click', () => downloadTemplate().catch((e) => toast(e.message)));
  main.querySelector('[data-dl="catalog"]').addEventListener('click', (e) => downloadCatalog(e.currentTarget));

  const out = document.getElementById('imp-result');
  const drop = document.getElementById('drop');
  const input = document.getElementById('imp-file');

  async function handle(file) {
    if (!file) return;
    out.innerHTML = `<div class="pf-card"><p>Czytam <b>${esc(file.name)}</b>…</p></div>`;
    let products, issues;
    try {
      const buf = await file.arrayBuffer();
      const sheets = /\.csv$/i.test(file.name) ? readCsv(new TextDecoder().decode(buf)) : await readXlsx(buf);
      const sheet = pickSheet(sheets);
      if (!sheet) throw new Error('Nie znalazłem arkusza z nagłówkiem „nazwa”. Użyj szablonu z kroku 1.');
      ({ products, issues } = rowsToProducts(sheet.rows, cats));
    } catch (err) {
      out.innerHTML = `<div class="pf-errors">${esc(err.message)}</div>`;
      return;
    }
    if (!products.length) {
      out.innerHTML = `<div class="pf-errors"><p><b>W pliku nie ma produktów do importu.</b></p>${issues.map((i) => `<p>${i.row ? `Wiersz ${i.row}: ` : ''}${esc(i.message)}</p>`).join('')}</div>`;
      return;
    }
    out.innerHTML = `<div class="pf-card"><p>Sprawdzam ${products.length} produktów…</p><div class="progress"><i style="width:0"></i></div></div>`;
    const bar = out.querySelector('.progress i');
    let results;
    try {
      results = await inChunks(products, (part) => api('POST', '/api/admin/products/import', { products: part, dry_run: true }),
        (n, all) => { bar.style.width = `${(n / all) * 100}%`; });
    } catch (err) { out.innerHTML = `<div class="pf-errors">${esc(err.message)}</div>`; return; }
    showPreview(file.name, products, issues, results);
  }

  function showPreview(fileName, products, issues, results) {
    const ok = results.filter((r) => r.ok);
    const created = ok.filter((r) => r.action === 'nowy').length;
    const bad = results.length - ok.length;
    out.innerHTML = `
      <div class="pf-card imp-preview">
        <div class="pf-head"><h2 class="h3">Podgląd: ${esc(fileName)}</h2>
          <div class="chips"><a aria-current="true">Nowe<b>${created}</b></a><a aria-current="true">Aktualizacje<b>${ok.length - created}</b></a><a ${bad ? 'aria-current="true" class="bad"' : ''}>Z błędami<b>${bad}</b></a></div></div>
        ${issues.filter((i) => !products.some((p) => p._warnings?.some((w) => w.startsWith(`Wiersz ${i.row}:`)))).map((i) => `<p class="pf-errors">${i.row ? `Wiersz ${i.row}: ` : ''}${esc(i.message)}</p>`).join('')}
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th class="num">Wiersz</th><th>Produkt</th><th>Slug</th><th class="num">Warianty</th><th>Co się stanie</th></tr></thead><tbody>
        ${results.map((r) => {
          const p = products[r.i];
          const warn = p._warnings ?? [];
          return `<tr class="${r.ok ? '' : 'err'}"><td class="num mono">${p._row}</td><td class="wrap-cell"><b>${esc(p.name || '—')}</b>${!r.ok || warn.length ? `<ul class="imp-err">${[...(r.errors ?? []), ...warn].map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}</td>
            <td class="mono small">${esc(r.slug || p.slug || '—')}</td><td class="num">${p.variants.length}</td>
            <td>${r.ok ? `<span class="status-pill" data-status="${r.action === 'nowy' ? 'oplacone' : 'w_realizacji'}">${r.action === 'nowy' ? 'nowy produkt' : 'aktualizacja'}</span>` : '<span class="status-pill" data-status="anulowane">błąd — pominięty</span>'}</td></tr>`;
        }).join('')}
        </tbody></table></div>
        <div class="act-row imp-go">${ok.length ? `<button class="btn btn-primary" type="button" id="imp-go">Importuj ${ok.length} ${ok.length === 1 ? 'produkt' : ok.length < 5 ? 'produkty' : 'produktów'}</button>` : ''}
          <button class="btn" type="button" id="imp-again">Wczytaj inny plik</button>
          ${bad ? '<span class="small">Popraw błędy w Excelu i wczytaj plik ponownie albo importuj tylko poprawne.</span>' : ''}</div>
      </div>`;
    document.getElementById('imp-again').addEventListener('click', () => { input.value = ''; input.click(); });
    document.getElementById('imp-go')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const good = ok.map((r) => products[r.i]);
      const box = out.querySelector('.imp-go');
      box.innerHTML = `<div style="flex:1"><p class="small">Zapisuję…</p><div class="progress"><i style="width:0"></i></div></div>`;
      const bar = box.querySelector('.progress i');
      try {
        const saved = await inChunks(good, (part) => api('POST', '/api/admin/products/import', { products: part }), (n, all) => { bar.style.width = `${(n / all) * 100}%`; });
        const done = saved.filter((r) => r.ok);
        const failed = saved.filter((r) => !r.ok);
        categoriesCache = null;
        out.innerHTML = `<div class="pf-card imp-done"><h2 class="h3">Zaimportowano ${done.length} z ${good.length}</h2>
          <ul class="plain">${done.map((r) => `<li><span class="status-pill" data-status="oplacone">${r.action}</span> <a href="#produkt-${r.id}">${esc(r.name)}</a> <a class="small" href="/#p-${esc(r.slug)}" target="_blank" rel="noopener">w sklepie ↗</a></li>`).join('')}</ul>
          ${failed.length ? `<div class="pf-errors">${failed.map((r) => `<p>${esc(r.name || r.slug)}: ${esc((r.errors ?? []).join(' '))}</p>`).join('')}</div>` : ''}
          <div class="act-row"><a class="btn btn-primary" href="#produkty">Przejdź do produktów</a><button class="btn" type="button" id="imp-again2">Kolejny plik</button></div></div>`;
        document.getElementById('imp-again2').addEventListener('click', () => viewImport());
        toast(`Zaimportowano ${done.length} produktów.`);
      } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
    });
  }

  input.addEventListener('change', () => handle(input.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.dataset.over = '1'; }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => { delete drop.dataset.over; }));
  drop.addEventListener('drop', (e) => { e.preventDefault(); handle(e.dataTransfer.files[0]); });
}
