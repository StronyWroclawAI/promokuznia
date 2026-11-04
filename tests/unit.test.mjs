// Testy jednostkowe logiki sklepu: `npm test` (wbudowany test runner Node.js, bez dodatkowych pakietów).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { computeTotals, shippingOptions, paymentOptions, vatFromGross, FREE_SHIPPING_GR, COD_FEE_GR } from '../public/assets/pricing.js';
import { validNip, validateCheckout, CheckoutError } from '../functions/_lib/orders.js';
import { lowestBeforeReduction } from '../functions/_lib/catalog.js';
import { verifyStripeSignature } from '../functions/_lib/payments.js';
import { hashPassword, verifyPassword } from '../functions/_lib/crypto.js';
import { splitStreet, shipmentPayload, defaultParcel, statusLabel, isInTransit } from '../functions/_lib/inpost.js';
import { isAdmin } from '../functions/_lib/admin.js';

const line = (price, qty, product = {}) => ({ qty, variant: { price_gr: price }, product: { type: 'physical', shipping_class: 'paczkomat', vat_rate: 23, ...product } });

// ───────────── Ceny, dostawa, VAT ─────────────

test('suma, domyślna dostawa Paczkomatem i brakująca kwota do darmowej dostawy', () => {
  const t = computeTotals([line(4900, 2)]);
  assert.equal(t.subtotal_gr, 9800);
  assert.equal(t.shipping.method, 'paczkomat');
  assert.equal(t.shipping.price_gr, 1399);
  assert.equal(t.total_gr, 9800 + 1399);
  assert.equal(t.missing_for_free_shipping_gr, FREE_SHIPPING_GR - 9800);
});

test('darmowa dostawa od 300 zł liczona po rabacie', () => {
  const coupon = { code: 'START10', kind: 'procent', value: 10, min_total_gr: 5000 };
  // 320 zł − 10% = 288 zł → dostawa płatna
  const t = computeTotals([line(32000, 1)], coupon);
  assert.equal(t.discount_gr, 3200);
  assert.equal(t.shipping.price_gr, 1399);
  assert.equal(computeTotals([line(34000, 1)], coupon).shipping.price_gr, 0);
});

test('kod rabatowy poniżej minimum nie działa i mówi dlaczego', () => {
  const t = computeTotals([line(3900, 1)], { code: 'START10', kind: 'procent', value: 10, min_total_gr: 5000 });
  assert.equal(t.discount_gr, 0);
  assert.equal(t.coupon.ok, false);
  assert.match(t.coupon.message, /od 50 zł/);
});

test('kod na darmową dostawę zeruje dostawę, ale nie opłatę za pobranie', () => {
  const coupon = { code: 'DOSTAWA0', kind: 'darmowa_dostawa', value: 0, min_total_gr: 10000 };
  const t = computeTotals([line(12000, 1)], coupon, { shipping_method: 'kurier_inpost', payment_method: 'pobranie' });
  assert.equal(t.shipping.base_gr, 0);
  assert.equal(t.shipping.cod_fee_gr, COD_FEE_GR);
  assert.equal(t.total_gr, 12000 + COD_FEE_GR);
});

test('produkt tylko dla kuriera wyłącza Paczkomat, a pobranie działa tylko z kurierem', () => {
  const lines = [line(24900, 1, { shipping_class: 'kurier' })];
  const opts = shippingOptions(lines);
  assert.equal(opts.find((o) => o.method === 'paczkomat').available, false);
  assert.equal(computeTotals(lines).shipping.method, 'kurier_inpost');
  assert.equal(paymentOptions(lines, 'paczkomat').find((p) => p.method === 'pobranie').available, false);
  assert.equal(paymentOptions(lines, 'kurier_inpost').find((p) => p.method === 'pobranie').available, true);
});

test('produkty cyfrowe nie mają dostawy', () => {
  const t = computeTotals([line(7900, 1, { type: 'digital' })]);
  assert.equal(t.shipping, null);
  assert.equal(t.total_gr, 7900);
});

test('VAT: 23% w cenie brutto, bon bez VAT, dostawa 23%', () => {
  assert.equal(vatFromGross(12300, 23), 2300);
  const t = computeTotals([line(12300, 1), line(10000, 1, { type: 'gift_card', vat_rate: null })]);
  // 23 zł z produktu + 0 z bonu + VAT z dostawy 13,99 zł
  assert.equal(t.vat_gr, 2300 + vatFromGross(1399, 23));
});

// ───────────── Walidacja kasy ─────────────

const body = (extra = {}) => ({
  email: 'jan@example.com', phone: '600 100 200', shipping_method: 'paczkomat', ship_name: 'Jan Kowalski',
  locker_code: 'wro01m', payment_method: 'stripe', terms: true, ...extra
});
const field = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof CheckoutError); return e.extra.field; } assert.fail('miało rzucić błąd'); };

test('NIP: suma kontrolna', () => {
  assert.equal(validNip('526-025-02-74'), true);
  assert.equal(validNip('1234567890'), false);
  assert.equal(validNip('123'), false);
});

test('kasa: poprawne dane Paczkomatu przechodzą, kod jest normalizowany', () => {
  const v = validateCheckout(body(), [line(4900, 1)]);
  assert.equal(v.lockerCode, 'WRO01M');
  assert.equal(v.shippingMethod, 'paczkomat');
});

test('kasa: wskazuje pole z błędem', () => {
  const lines = [line(4900, 1)];
  assert.equal(field(() => validateCheckout(body({ email: 'zly' }), lines)), 'email');
  assert.equal(field(() => validateCheckout(body({ locker_code: 'X1' }), lines)), 'locker_code');
  assert.equal(field(() => validateCheckout(body({ terms: false }), lines)), 'terms');
  assert.equal(field(() => validateCheckout(body({ payment_method: 'pobranie' }), lines)), 'payment_method');
  assert.equal(field(() => validateCheckout(body({ shipping_method: 'kurier_inpost', ship_street: 'ul. Długa 1', ship_postcode: '50100', ship_city: 'Wrocław' }), lines)), 'ship_postcode');
  assert.equal(field(() => validateCheckout(body({ invoice: true, bill_company: 'Firma', bill_nip: '1234567890', bill_street: 'ul. A 1', bill_postcode: '50-001', bill_city: 'Wrocław' }), lines)), 'bill_nip');
});

test('kasa: produkt cyfrowy wymaga zgody na natychmiastowe dostarczenie', () => {
  const lines = [line(7900, 1, { type: 'digital' })];
  assert.equal(field(() => validateCheckout({ email: 'jan@example.com', payment_method: 'stripe', terms: true }, lines)), 'digital_consent');
  assert.equal(validateCheckout({ email: 'jan@example.com', payment_method: 'stripe', terms: true, digital_consent: true }, lines).shippingMethod, 'brak');
});

// ───────────── Omnibus ─────────────

test('Omnibus: najniższa cena z 30 dni przed obniżką', () => {
  const d = (days) => new Date(Date.now() - days * 864e5).toISOString();
  assert.equal(lowestBeforeReduction([
    { price_gr: 8900, valid_from: d(40) }, { price_gr: 9900, valid_from: d(25) }, { price_gr: 7900, valid_from: d(5) }
  ]), 8900);
  // podwyżka to nie obniżka
  assert.equal(lowestBeforeReduction([{ price_gr: 7900, valid_from: d(20) }, { price_gr: 9900, valid_from: d(2) }]), null);
});

// ───────────── Bezpieczeństwo ─────────────

test('podpis webhooka Stripe: poprawny, podrobiony i przeterminowany', async () => {
  const secret = 'whsec_test';
  const raw = JSON.stringify({ id: 'evt_1' });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  assert.equal(await verifyStripeSignature(raw, `t=${t},v1=${sig}`, secret), true);
  assert.equal(await verifyStripeSignature(raw, `t=${t},v1=${'0'.repeat(64)}`, secret), false);
  assert.equal(await verifyStripeSignature(raw + ' ', `t=${t},v1=${sig}`, secret), false);
  const old = t - 3600;
  const oldSig = createHmac('sha256', secret).update(`${old}.${raw}`).digest('hex');
  assert.equal(await verifyStripeSignature(raw, `t=${old},v1=${oldSig}`, secret), false);
});

test('hasła: PBKDF2 z solą, weryfikacja i odrzucenie złego hasła', async () => {
  const h1 = await hashPassword('dlugiehaslo123');
  const h2 = await hashPassword('dlugiehaslo123');
  assert.notEqual(h1, h2);   // inna sól
  assert.match(h1, /^pbkdf2\$100000\$/);
  assert.equal(await verifyPassword('dlugiehaslo123', h1), true);
  assert.equal(await verifyPassword('zlehaslo', h1), false);
});

test('panel: dostęp tylko dla adresów z ADMIN_EMAILS (bez względu na wielkość liter)', () => {
  const env = { ADMIN_EMAILS: 'Szef@Firma.pl, druga@firma.pl' };
  assert.equal(isAdmin(env, { email: 'szef@firma.pl' }), true);
  assert.equal(isAdmin(env, { email: 'klient@firma.pl' }), false);
  assert.equal(isAdmin({}, { email: 'szef@firma.pl' }), false);
});

// ───────────── InPost ─────────────

test('InPost: rozdzielanie ulicy i numeru', () => {
  assert.deepEqual(splitStreet('ul. Świdnicka 10/4'), { street: 'ul. Świdnicka', building_number: '10/4' });
  assert.deepEqual(splitStreet('Plac Grunwaldzki 22A'), { street: 'Plac Grunwaldzki', building_number: '22A' });
});

test('InPost: przesyłka do Paczkomatu i kurierska z pobraniem', () => {
  const base = { number: 'PK/2026/000001', email: 'jan@example.com', phone: '+48 600 100 200', total_gr: 12099 };
  const locker = shipmentPayload({ ...base, shipping_method: 'paczkomat', locker_code: 'WRO01M', payment_method: 'stripe', shipping_json: '{"name":"Jan Kowalski"}' }, { kind: 'template', size: 'C' });
  assert.equal(locker.service, 'inpost_locker_standard');
  assert.equal(locker.custom_attributes.target_point, 'WRO01M');
  assert.deepEqual(locker.parcels, [{ template: 'large' }]);
  assert.equal(locker.receiver.phone, '600100200');
  assert.equal(locker.cod, undefined);

  const courier = shipmentPayload({ ...base, shipping_method: 'kurier_inpost', payment_method: 'pobranie',
    shipping_json: JSON.stringify({ name: 'Ewa Nowak', street: 'ul. Długa 5', postcode: '50-100', city: 'Wrocław' }) },
  { kind: 'dimensions', weight_kg: 2.5, length_cm: 30, width_cm: 20, height_cm: 10 });
  assert.equal(courier.service, 'inpost_courier_standard');
  assert.equal(courier.cod.amount, '120.99');
  assert.equal(courier.insurance.amount, '120.99');
  assert.equal(courier.receiver.address.building_number, '5');
  assert.equal(courier.parcels[0].dimensions.length, '300');
});

test('InPost: gabaryt Paczkomatu to największy z produktów', () => {
  const p = defaultParcel({ shipping_method: 'paczkomat' }, [{ variant_id: 1, qty: 1 }, { variant_id: 2, qty: 1 }], { 1: { parcel_size: 'A' }, 2: { parcel_size: 'B' } });
  assert.deepEqual(p, { kind: 'template', size: 'B' });
});

test('InPost: statusy po polsku i „w drodze”', () => {
  assert.equal(statusLabel('ready_to_pickup'), 'czeka w Paczkomacie');
  assert.equal(isInTransit('collected_from_sender'), true);
  assert.equal(isInTransit('confirmed'), false);
});

// ───────────── Produkty: Excel i walidacja (Etap 8) ─────────────

import { writeXlsx, readXlsx, readCsv } from '../public/admin/xlsx.js';
import { rowsToProducts, productToRows, COLUMNS, templateXlsx, pickSheet } from '../public/admin/sheet.js';
import { normalizeProduct, plan, slugify } from '../functions/_lib/products-admin.js';

const CATS = [{ slug: 'gadzety-z-logo', name: 'Gadżety z logo' }, { slug: 'produkty-cyfrowe', name: 'Produkty cyfrowe' }, { slug: 'karty-podarunkowe', name: 'Karty podarunkowe' }];
const HEAD = COLUMNS.map((c) => c.header);
const row = (o) => COLUMNS.map((c) => o[c.key] ?? '');

test('xlsx: zapis i odczyt zachowuje tekst z polskimi znakami, liczby i puste komórki', async () => {
  const bytes = writeXlsx([{ name: 'Produkty', rows: [['a', 'b', 'c'], ['Żółć & <znaczniki>', 49.9, ''], ['', '', 7]], headerRow: true }]);
  const [sheet] = await readXlsx(bytes);
  assert.equal(sheet.name, 'Produkty');
  assert.deepEqual(sheet.rows[1], ['Żółć & <znaczniki>', 49.9]);
  assert.deepEqual(sheet.rows[2], ['', '', 7]);
});

test('szablon ma arkusz Produkty z nagłówkiem, a przykład daje poprawne produkty', async () => {
  const sheets = await readXlsx(templateXlsx(CATS));
  assert.deepEqual(sheets.map((s) => s.name), ['Produkty', 'Przykład', 'Instrukcja', 'Słowniki']);
  assert.equal(pickSheet(sheets).name, 'Produkty');
  const { products, issues } = rowsToProducts(sheets[1].rows, CATS);
  assert.equal(issues.length, 0);
  assert.equal(products.length, 2);
  assert.equal(products[0].variants.length, 2);
  for (const p of products) assert.deepEqual(normalizeProduct(p, CATS.map((c) => c.slug)).errors, []);
});

test('import: wiersze bez danych produktu to kolejne warianty; zł, VAT, tak/nie i specyfikacja', () => {
  const { products, issues } = rowsToProducts([
    HEAD,
    row({ name: 'Kubek emaliowany', category: 'Gadżety z logo', type: 'fizyczny', vat_rate: 0.23, personalizable: 'TAK', weight_g: 800, dims: '30 x 20 x 10', specs: 'Pojemność: 350 ml | Materiał: stal', badges: 'Nowość, Promocja', variant: '10 szt.', price: '349,00 zł', stock: 20 }),
    row({ variant: '50 szt.', price: 1499 }),
    row({ name: 'Bon 100', category: 'karty-podarunkowe', type: 'karta podarunkowa', vat_rate: 'zw', variant: '100 zł', price: 100 }),
    row({ name: 'Zły', category: 'gadzety-z-logo', type: 'fizyczny', variant: 'A', price: 'dużo' })
  ], CATS);
  const [kubek, bon, zly] = products;
  assert.equal(kubek.slug, '');
  assert.equal(kubek.category, 'gadzety-z-logo');
  assert.equal(kubek.vat_rate, 23);
  assert.equal(kubek.personalizable, true);
  assert.deepEqual(kubek.dims_cm, [30, 20, 10]);
  assert.deepEqual(kubek.specs, [['Pojemność', '350 ml'], ['Materiał', 'stal']]);
  assert.deepEqual(kubek.variants.map((v) => [v.label, v.price_gr, v.stock]), [['10 szt.', 34900, 20], ['50 szt.', 149900, null]]);
  assert.equal(bon.type, 'gift_card');
  assert.equal(bon.vat_rate, null);
  assert.equal(normalizeProduct(bon, CATS.map((c) => c.slug)).errors.length, 0);
  assert.match(issues[0].message, /nie jest liczbą/);
  assert.ok(zly._warnings.length);
  assert.ok(normalizeProduct(zly, CATS.map((c) => c.slug)).errors.some((e) => /cena/.test(e)));
});

test('eksport i ponowny import dają ten sam produkt', () => {
  const p = { slug: 'kubek-x', name: 'Kubek X', category: 'gadzety-z-logo', type: 'physical', short: 's', description: 'd', vat_rate: 23, personalizable: true, lead_time_days: 5, weight_g: 400, dims_cm: [10, 10, 12], shipping_class: 'paczkomat', parcel_size: 'A', specs: [['A', 'b']], badges: ['Nowość'], compare_at_gr: null, active: true, images: [{ src: 'https://example.com/a.jpg' }], variants: [{ sku: 'PK-1', label: 'biały', price_gr: 3900, stock: 10, active: true }, { sku: 'PK-2', label: 'czarny', price_gr: 4400, stock: null, active: true }] };
  const [back] = rowsToProducts([HEAD, ...productToRows(p)], CATS).products;
  assert.equal(back.slug, 'kubek-x');
  assert.deepEqual(back.variants, [{ label: 'biały', sku: 'PK-1', price_gr: 3900, stock: 10 }, { label: 'czarny', sku: 'PK-2', price_gr: 4400, stock: null }]);
  assert.deepEqual(back.images, [{ src: 'https://example.com/a.jpg', alt: '' }]);
});

test('CSV z Arkuszy Google: średnik, cudzysłowy i nowe linie w komórce', () => {
  const [s] = readCsv('﻿nazwa;opis\n"Kubek; duży";"linia 1\nlinia 2"\n');
  assert.deepEqual(s.rows[1], ['Kubek; duży', 'linia 1\nlinia 2']);
});

test('walidacja produktu: slug z polskich znaków, wymagane pola, adresy zdjęć', () => {
  assert.equal(slugify('Łódka żółta — 100% bawełny'), 'lodka-zolta-100-bawelny');
  const { errors } = normalizeProduct({ name: 'Torba', category: 'gadzety-z-logo', type: 'physical', images: ['http://niebezpieczny.pl/a.jpg'], variants: [{ label: 'A', price_gr: 1000 }, { label: 'a', price_gr: 1000 }] }, ['gadzety-z-logo']);
  assert.ok(errors.some((e) => /wagi/.test(e)));
  assert.ok(errors.some((e) => /https:\/\//.test(e)));
  assert.ok(errors.some((e) => /tę samą nazwę/.test(e)));
});

test('plan importu: SKU innego produktu i stan poniżej rezerwacji blokują zapis', () => {
  const index = {
    bySlug: new Map([['kubek', { id: 1, slug: 'kubek' }]]), byId: new Map([[1, { id: 1, slug: 'kubek' }]]),
    variants: [{ id: 10, product_id: 1, sku: 'PK-1', label: 'biały', price_gr: 3900, stock: 10, reserved: 4 }],
    skuOwner: new Map([['PK-1', 1]])
  };
  const base = { name: 'Nowy', category: 'gadzety-z-logo', type: 'digital', variants: [{ sku: 'PK-1', label: 'x', price_gr: 1000 }] };
  assert.match(plan(normalizeProduct(base, ['gadzety-z-logo']).value, index).errors[0], /innego produktu/);
  const upd = normalizeProduct({ ...base, slug: 'kubek', name: 'Kubek', variants: [{ sku: 'PK-1', label: 'biały', price_gr: 3900, stock: 2 }] }, ['gadzety-z-logo']).value;
  const p = plan(upd, index);
  assert.equal(p.action, 'aktualizacja');
  assert.match(p.errors[0], /4 szt/);
});
