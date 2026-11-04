import { json, problem } from '../_lib/http.js';

// GET /api/lockers?q=Wrocław | 50-066 | 51.11,17.03 | WRO01M
// Wyszukiwarka Paczkomatów bez konta InPost — publiczne API punktów ShipX (GET /v1/points, bez tokenu).
// Serwer pośredniczy, żeby: ujednolicić odpowiedź, ograniczyć pola i cache'ować wyniki na brzegu Cloudflare.
const API = 'https://api-shipx-pl.easypack24.net/v1/points';
const FIELDS = 'name,status,location,location_description,location_247,address,address_details,distance,opening_hours,type';

export async function onRequestGet({ request }) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return problem(400, 'Wpisz miasto, kod pocztowy albo kod Paczkomatu.');

  const p = new URLSearchParams({ type: 'parcel_locker', per_page: '12', fields: FIELDS });
  const coords = q.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (coords) {
    p.set('relative_point', `${coords[1]},${coords[2]}`);
    p.set('max_distance', '5000');
    p.set('sort_by', 'distance_to_relative_point');
  } else if (/^\d{2}-?\d{3}$/.test(q)) {
    p.set('relative_post_code', q.includes('-') ? q : `${q.slice(0, 2)}-${q.slice(2)}`);
    p.set('max_distance', '5000');
    p.set('sort_by', 'distance_to_relative_point');
  } else if (/^[A-Za-z]{3}\d{2,3}[A-Za-z]{1,2}$/.test(q)) {
    p.set('name', q.toUpperCase());
  } else {
    p.set('city', q);
    p.set('per_page', '30');
  }

  let data;
  try {
    const res = await fetch(`${API}?${p}`, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true }     // lista punktów zmienia się rzadko
    });
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  } catch {
    return problem(502, 'Wyszukiwarka InPost chwilowo nie odpowiada. Wpisz kod Paczkomatu ręcznie.');
  }

  const lockers = (data.items ?? [])
    .filter((x) => !x.status || x.status === 'Operating')
    .map((x) => {
      const a = x.address_details ?? {};
      return {
        code: x.name,
        street: [a.street, a.building_number].filter(Boolean).join(' ') || x.address?.line1 || '',
        city: [a.post_code, a.city].filter(Boolean).join(' ') || x.address?.line2 || '',
        description: x.location_description ?? '',
        open247: x.location_247 !== false,
        hours: x.location_247 === false ? (x.opening_hours ?? '') : '',
        distance_m: Number.isFinite(x.distance) ? Math.round(x.distance) : null,
        lat: x.location?.latitude ?? null,
        lng: x.location?.longitude ?? null
      };
    })
    .slice(0, 30);

  return json({ lockers, query: q }, { cache: 'public, max-age=600' });
}
