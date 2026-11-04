import { json } from '../../../_lib/http.js';
import { productsForAdmin } from '../../../_lib/products-admin.js';

// GET /api/admin/products/export — cały katalog w kształcie do pliku Excel (panel zamienia go na wiersze)
export async function onRequestGet({ env }) {
  return json({ products: await productsForAdmin(env.DB) });
}
