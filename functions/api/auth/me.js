import { json } from '../../_lib/http.js';
import { publicCustomer } from '../../_lib/auth.js';
import { isAdmin } from '../../_lib/admin.js';

// GET /api/auth/me — kto jest zalogowany (null dla gościa) i czy ma dostęp do panelu
export async function onRequestGet({ data, env }) {
  const customer = publicCustomer(data.customer);
  return json({ customer: customer && { ...customer, is_admin: isAdmin(env, data.customer) } });
}
