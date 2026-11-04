// /api/admin/* — tylko zalogowane konto z listy ADMIN_EMAILS (sesję ustawia nadrzędny middleware /api)
import { problem } from '../../_lib/http.js';
import { isAdmin } from '../../_lib/admin.js';

export async function onRequest(context) {
  const { data, env } = context;
  if (!data.customer) return problem(401, 'Zaloguj się kontem administratora.');
  if (!isAdmin(env, data.customer)) return problem(403, 'To konto nie ma dostępu do panelu.');
  return context.next();
}
