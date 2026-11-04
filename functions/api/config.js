import { json } from '../_lib/http.js';

// GET /api/config — publiczne ustawienia dla frontu (klucz Turnstile jest jawny z założenia)
export async function onRequestGet({ env }) {
  return json({ turnstile_site_key: env.TURNSTILE_SITE_KEY || null, demo: env.SHOP_MODE === 'demo' }, { cache: 'public, max-age=300' });
}
