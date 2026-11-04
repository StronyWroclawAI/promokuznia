import { json } from '../../_lib/http.js';
import { publicCustomer } from '../../_lib/auth.js';

// GET /api/auth/me — kto jest zalogowany (null dla gościa)
export async function onRequestGet({ data }) {
  return json({ customer: publicCustomer(data.customer) });
}
