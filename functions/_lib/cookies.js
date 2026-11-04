export const CART_COOKIE = 'pk_cart';
export const SESSION_COOKIE = 'pk_session';

export function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// HttpOnly — JavaScript strony nie ma dostępu; SameSite=Lax — ochrona przed CSRF z obcych stron
export function cookie(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export const clearCookie = (name) => `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
