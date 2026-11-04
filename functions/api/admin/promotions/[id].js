import { json, problem } from '../../../_lib/http.js';
import { endPromotion, PromoError } from '../../../_lib/promotions.js';

// DELETE /api/admin/promotions/:id — zakończenie promocji teraz (ceny wracają do poprzednich)
export async function onRequestDelete({ env, params }) {
  try {
    await endPromotion(env.DB, params.id);
    return json({ ok: true, message: 'Promocja zakończona, ceny wróciły do poprzednich.' });
  } catch (e) {
    if (e instanceof PromoError) return problem(e.status, e.message);
    throw e;
  }
}
