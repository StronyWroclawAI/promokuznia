// InPost ShipX API v1 — przesyłki Paczkomat i kurier, etykiety, statusy.
// Dokumentacja: https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/622754/API+ShipX
// Bez INPOST_API_TOKEN (i przy SHOP_MODE=demo) działa symulator: ten sam przepływ, testowa etykieta PDF.
import { randomToken } from './crypto.js';

const HOST = (env) => (env.INPOST_SANDBOX === '0' ? 'https://api-shipx-pl.easypack24.net' : 'https://sandbox-api-shipx-pl.easypack24.net');
export const inpostMode = (env) => (env.INPOST_API_TOKEN && env.INPOST_ORGANIZATION_ID ? 'api' : env.SHOP_MODE === 'demo' ? 'symulator' : null);

// Gabaryty Paczkomatu: A 8×38×64, B 19×38×64, C 41×38×64 cm, do 25 kg
const TEMPLATE = { A: 'small', B: 'medium', C: 'large' };
const SIZE_ORDER = ['A', 'B', 'C'];

// Statusy ShipX → co znaczą dla zamówienia
const STATUS_PL = {
  created: 'utworzona', offers_prepared: 'przygotowana', offer_selected: 'przygotowana', confirmed: 'etykieta gotowa',
  dispatched_by_sender: 'nadana w Paczkomacie', collected_from_sender: 'odebrana od nadawcy', taken_by_courier: 'u kuriera',
  adopted_at_source_branch: 'w oddziale nadawczym', sent_from_source_branch: 'w drodze', adopted_at_sorting_center: 'w sortowni',
  sent_from_sorting_center: 'w drodze', adopted_at_target_branch: 'w oddziale docelowym', out_for_delivery: 'wydana do doręczenia',
  ready_to_pickup: 'czeka w Paczkomacie', pickup_reminder_sent: 'przypomnienie o odbiorze', delivered: 'doręczona',
  avizo: 'awizo', returned_to_sender: 'zwrócona do nadawcy', canceled: 'anulowana', undelivered: 'niedoręczona'
};
const IN_TRANSIT = new Set(['dispatched_by_sender', 'collected_from_sender', 'taken_by_courier', 'adopted_at_source_branch',
  'sent_from_source_branch', 'adopted_at_sorting_center', 'sent_from_sorting_center', 'adopted_at_target_branch',
  'out_for_delivery', 'ready_to_pickup', 'pickup_reminder_sent', 'avizo']);
export const statusLabel = (s) => STATUS_PL[s] ?? s;
export const isInTransit = (s) => IN_TRANSIT.has(s);
export const isDelivered = (s) => s === 'delivered';

async function shipx(env, method, path, body) {
  const res = await fetch(`${HOST(env)}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.INPOST_API_TOKEN}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (method === 'GET' && path.includes('/label')) {
    if (!res.ok) throw new Error(`InPost: etykieta niedostępna (${res.status})`);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data.details ? ` ${JSON.stringify(data.details).slice(0, 300)}` : '';
    throw new Error(`InPost: ${data.message ?? data.error ?? res.status}${details}`);
  }
  return data;
}

// „ul. Świdnicka 10/4” → ulica „ul. Świdnicka”, numer „10/4”
export function splitStreet(line) {
  const m = String(line ?? '').trim().match(/^(.*?)[\s,]+(\d+[A-Za-z]?(?:\s*[/-]\s*\d+[A-Za-z]?)?)$/);
  return m ? { street: m[1], building_number: m[2].replace(/\s/g, '') } : { street: String(line ?? '').trim(), building_number: '1' };
}

const phone9 = (p) => String(p ?? '').replace(/\D/g, '').replace(/^48(?=\d{9}$)/, '').slice(-9);
const plnDecimal = (gr) => (gr / 100).toFixed(2);

// Domyślna paczka z produktów w zamówieniu
export function defaultParcel(order, items, products) {
  if (order.shipping_method === 'paczkomat') {
    const sizes = items.map((i) => products[i.variant_id]?.parcel_size).filter(Boolean);
    const size = sizes.sort((a, b) => SIZE_ORDER.indexOf(b) - SIZE_ORDER.indexOf(a))[0] ?? 'B';
    return { kind: 'template', size };
  }
  const weightKg = Math.max(0.5, Math.ceil(items.reduce((s, i) => s + (products[i.variant_id]?.weight_g ?? 500) * i.qty, 0) / 100) / 10);
  const dims = items.map((i) => products[i.variant_id]?.dims ?? [30, 20, 10]);
  const max = (k) => Math.max(...dims.map((d) => d[k]));
  return { kind: 'dimensions', weight_kg: Math.min(30, weightKg), length_cm: max(0), width_cm: max(1), height_cm: Math.max(5, max(2)) };
}

export function shipmentPayload(order, parcel) {
  const ship = JSON.parse(order.shipping_json ?? '{}');
  const [first, ...rest] = String(ship.name ?? '').trim().split(/\s+/);
  const receiver = {
    first_name: first || 'Klient', last_name: rest.join(' ') || 'PromoKuźni', name: ship.name ?? '',
    email: order.email, phone: phone9(order.phone)
  };
  const locker = order.shipping_method === 'paczkomat';
  if (!locker) {
    const { street, building_number } = splitStreet(ship.street);
    receiver.address = { street, building_number, city: ship.city, post_code: ship.postcode, country_code: 'PL' };
  }
  const parcels = parcel.kind === 'template'
    ? [{ template: TEMPLATE[parcel.size] ?? 'medium' }]
    : [{
      dimensions: { length: String(parcel.length_cm * 10), width: String(parcel.width_cm * 10), height: String(parcel.height_cm * 10), unit: 'mm' },
      weight: { amount: String(parcel.weight_kg), unit: 'kg' }
    }];
  const body = {
    receiver,
    parcels,
    service: locker ? 'inpost_locker_standard' : 'inpost_courier_standard',
    reference: order.number,
    custom_attributes: {
      sending_method: locker ? 'parcel_locker' : 'dispatch_order',
      ...(locker ? { target_point: order.locker_code } : {})
    }
  };
  if (order.payment_method === 'pobranie') {
    body.cod = { amount: plnDecimal(order.total_gr), currency: 'PLN' };
    body.insurance = { amount: plnDecimal(order.total_gr), currency: 'PLN' };   // przy pobraniu InPost wymaga ubezpieczenia ≥ kwoty
  }
  return body;
}

// ───────────── Operacje ─────────────

export async function createShipment(env, order, parcel) {
  const payload = shipmentPayload(order, parcel);
  if (inpostMode(env) === 'symulator') {
    return { id: `demo-${randomToken(8)}`, status: 'confirmed', tracking_number: demoTracking(), payload };
  }
  const data = await shipx(env, 'POST', `/v1/organizations/${env.INPOST_ORGANIZATION_ID}/shipments`, payload);
  return { id: String(data.id), status: data.status, tracking_number: data.tracking_number ?? null, payload };
}

// Status i numer przesyłki (numer pojawia się po opłaceniu przesyłki — w trybie uproszczonym kilka sekund po utworzeniu)
export async function getShipment(env, shipment) {
  if (shipment.external_id?.startsWith('demo-')) {
    // symulator: każde odświeżenie przesuwa paczkę o krok dalej
    const flow = ['confirmed', 'collected_from_sender', 'sent_from_sorting_center',
      shipment.service === 'inpost_locker_standard' ? 'ready_to_pickup' : 'out_for_delivery', 'delivered'];
    const i = flow.indexOf(shipment.status);
    return { status: flow[Math.min(flow.length - 1, i + 1)], tracking_number: shipment.tracking_number };
  }
  const data = await shipx(env, 'GET', `/v1/shipments/${encodeURIComponent(shipment.external_id)}`);
  return { status: data.status, tracking_number: data.tracking_number ?? null };
}

export async function labelPdf(env, shipment, format = 'A6') {
  if (shipment.external_id?.startsWith('demo-')) return demoLabel(shipment);
  const res = await shipx(env, 'GET', `/v1/shipments/${encodeURIComponent(shipment.external_id)}/label?format=pdf&type=${format === 'A4' ? 'normal' : 'A6'}`);
  return new Uint8Array(await res.arrayBuffer());
}

// Czy Paczkomat o tym kodzie istnieje i działa (publiczne API punktów, bez tokenu).
// Gdy API nie odpowiada, nie blokujemy zamówienia — zwracamy null.
export async function checkPoint(env, code) {
  try {
    const res = await fetch(`https://api-shipx-pl.easypack24.net/v1/points/${encodeURIComponent(code)}`, { headers: { accept: 'application/json' } });
    if (res.status === 404) return { exists: false };
    if (!res.ok) return null;
    const p = await res.json();
    const a = p.address_details ?? {};
    return {
      exists: true,
      operating: p.status ? p.status === 'Operating' : true,
      label: [a.street && `${a.street} ${a.building_number ?? ''}`.trim(), a.city].filter(Boolean).join(', ') || p.location_description || ''
    };
  } catch {
    return null;
  }
}

// ───────────── Symulator ─────────────

const demoTracking = () => `6${Array.from(crypto.getRandomValues(new Uint8Array(23)), (b) => b % 10).join('')}`;

// Najprostszy PDF A6 (105×148 mm) z tekstem — bez bibliotek. Polskie znaki zamieniamy na łacińskie (czcionka Helvetica WinAnsi).
function demoLabel(shipment) {
  const p = JSON.parse(shipment.payload_json ?? '{}');
  const ascii = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[łŁ]/g, (c) => (c === 'ł' ? 'l' : 'L')).replace(/[()\\]/g, '');
  const r = p.receiver ?? {};
  const lines = [
    ['F2', 16, 'InPost  ·  ETYKIETA TESTOWA'.replace('·', '-')],
    ['F1', 9, 'Sklep demonstracyjny PromoKuznia - nie nadawac'],
    ['F1', 9, ''],
    ['F2', 11, shipment.service === 'inpost_locker_standard' ? `Paczkomat ${p.custom_attributes?.target_point ?? ''}` : 'Kurier InPost'],
    ['F1', 10, `Odbiorca: ${ascii(`${r.first_name ?? ''} ${r.last_name ?? ''}`)}`],
    ['F1', 10, r.address ? ascii(`${r.address.street} ${r.address.building_number}, ${r.address.post_code} ${r.address.city}`) : ''],
    ['F1', 10, `Tel. ${r.phone ?? ''}`],
    ['F1', 10, `Zamowienie: ${ascii(p.reference ?? '')}`],
    ['F1', 10, p.cod ? `POBRANIE: ${p.cod.amount} PLN` : ''],
    ['F1', 9, ''],
    ['F2', 13, shipment.tracking_number ?? '']
  ].filter((l) => l[2] !== undefined);
  // pseudo-kod kreskowy z cyfr numeru
  const bars = [];
  let x = 20;
  for (const d of String(shipment.tracking_number ?? '0000').split('')) {
    const w = 1 + (Number(d) % 3);
    bars.push(`${x} 40 ${w} 60 re f`);
    x += w + 1 + (Number(d) % 2);
    if (x > 275) break;
  }
  let y = 390;
  const text = lines.map(([f, size, t]) => { y -= size + 8; return `BT /${f} ${size} Tf 20 ${y} Td (${ascii(t)}) Tj ET`; }).join('\n');
  const stream = `0 0 0 rg\n${text}\n${bars.join('\n')}\n1 w 12 12 273.6 395.6 re S`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 297.6 419.5] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
