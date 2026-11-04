import { randomToken, sha256 } from './crypto.js';
import { cookie, SESSION_COOKIE, CART_COOKIE, clearCookie } from './cookies.js';
import { nowIso } from './http.js';
import { mergeGuestCart } from './cart.js';

const SESSION_DAYS = 30;

export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase();
export const isEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i.test(e);

export function passwordProblem(pw) {
  const s = String(pw ?? '');
  if (s.length < 10) return 'Hasło musi mieć co najmniej 10 znaków.';
  if (s.length > 200) return 'Hasło może mieć najwyżej 200 znaków.';
  return null;
}

export const publicCustomer = (c) => c && { email: c.email, first_name: c.first_name ?? null, last_name: c.last_name ?? null };

// Nowa sesja + przeniesienie koszyka gościa do konta
export async function signIn(context, customerId) {
  const { env, data } = context;
  const token = randomToken();
  await env.DB.prepare('INSERT INTO sessions (id, customer_id, expires_at) VALUES (?, ?, ?)')
    .bind(await sha256(token), customerId, nowIso(SESSION_DAYS * 86400000)).run();
  await mergeGuestCart(env.DB, data.cookies[CART_COOKIE], customerId);
  data.setCookies.push(cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400));
  data.setCookies.push(clearCookie(CART_COOKIE));
}

export async function signOut(context) {
  const { env, data } = context;
  if (data.customer?.session_id) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(data.customer.session_id).run();
  }
  data.setCookies.push(clearCookie(SESSION_COOKIE));
}
