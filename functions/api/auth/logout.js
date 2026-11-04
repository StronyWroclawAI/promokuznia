import { json } from '../../_lib/http.js';
import { signOut } from '../../_lib/auth.js';

// POST /api/auth/logout
export async function onRequestPost(context) {
  await signOut(context);
  return json({ ok: true });
}
