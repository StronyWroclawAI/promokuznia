// Kryptografia na Web Crypto (dostępne w Workers bez bibliotek)

const enc = new TextEncoder();

const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export function randomToken(bytes = 32) {
  return toB64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// PBKDF2-SHA256, 100 000 iteracji (maksimum obsługiwane przez Workers), sól 16 B.
// Format: pbkdf2$100000$<sól>$<hash>
const ITERATIONS = 100_000;

async function derive(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64url(salt)}$${toB64url(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iter, saltB64, hashB64] = String(stored ?? '').split('$');
  if (scheme !== 'pbkdf2' || !saltB64 || !hashB64) return false;
  const expected = fromB64url(hashB64);
  const actual = await derive(password, fromB64url(saltB64), Number(iter));
  // porównanie w stałym czasie
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < Math.min(expected.length, actual.length); i++) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

// Hash używany, gdy konta nie ma — żeby czas odpowiedzi nie zdradzał, czy e-mail istnieje
export const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
