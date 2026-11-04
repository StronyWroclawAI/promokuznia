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
