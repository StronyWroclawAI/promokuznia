export function json(data, { status = 200, cache = 'no-store', cookies = [] } = {}) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': cache
  });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(data), { status, headers });
}

export function problem(status, message, extra = {}) {
  return json({ error: message, ...extra }, { status });
}

// Odczyt JSON z limitem rozmiaru; zwraca null przy błędnym ciele
export async function readJson(request, maxBytes = 16_384) {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const data = JSON.parse(text || '{}');
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, 'Z');

// Odpowiedź publiczna z pamięci podręcznej Cloudflare (Cache API) — katalog nie odpytuje D1 przy każdej wizycie.
// Zmiany z panelu widać po maks. `seconds` sekundach.
export async function edgeCached(request, seconds, build) {
  const cache = globalThis.caches?.default;
  if (!cache || request.method !== 'GET') return build();
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await build();
  if (res.status === 200) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('cache-control', `public, max-age=${Math.min(seconds, 30)}, s-maxage=${seconds}`);
    await cache.put(request, copy.clone());
    return copy;
  }
  return res;
}
