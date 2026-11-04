// Panel admina: uprawnienia i operacje na zamówieniach.
import { finalizeOrder, cancelOrder, STATUS_LABEL } from './orders.js';
import { stripeRefund } from './payments.js';
import { nowIso } from './http.js';

// Administratorzy = konta sklepu z e-mailem z listy ADMIN_EMAILS (sekret w Cloudflare, przecinki)
export function isAdmin(env, customer) {
  if (!customer) return false;
  const list = String(env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(String(customer.email).toLowerCase());
}

export class ActionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const event = (db, orderId, from, to, note) =>
  db.prepare(`INSERT INTO order_events (order_id, from_status, to_status, source, note) VALUES (?, ?, ?, 'admin', ?)`)
    .bind(orderId, from, to, note ?? null);

// Zmiana statusu tylko z dozwolonego stanu — warunek w samym UPDATE chroni przed dwoma adminami naraz
async function move(db, order, allowedFrom, to, note, extra = []) {
  if (!allowedFrom.includes(order.status)) {
    throw new ActionError(409, `Nie można zmienić statusu „${STATUS_LABEL[order.status]}” na „${STATUS_LABEL[to]}”.`);
  }
  const res = await db.prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?').bind(to, order.id, order.status).run();
  if (res.meta.changes !== 1) throw new ActionError(409, 'Ktoś właśnie zmienił to zamówienie. Odśwież stronę.');
  await db.batch([event(db, order.id, order.status, to, note), ...extra]);
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// Dostępne akcje dla zamówienia — front pokazuje tylko te przyciski
export function availableActions(order, items, payment) {
  const a = [];
  const s = order.status;
  if (s === 'czeka_na_platnosc') {
    if (order.payment_method === 'przelew') a.push('mark_paid');
    a.push('cancel');
  }
  if (s === 'akceptacja_projektu') a.push('approve_project', 'request_changes');
  if (s === 'w_realizacji') {
    if (order.shipping_method === 'brak') a.push('complete');
    else a.push('ship');
  }
  if (s === 'wyslane') a.push('deliver');
  if (s === 'dostarczone') a.push('complete');
  const refundable = payment && ['oplacona', 'czesciowo_zwrocona'].includes(payment.status) && payment.amount_gr > payment.refunded_gr;
  if (refundable && !['anulowane', 'zwrocone'].includes(s)) a.push('refund');
  a.push('note');
  return a;
}

export async function runAction(env, order, action, body) {
  const db = env.DB;
  const { results: items } = await db.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(order.id).all();
  const payment = await db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY attempt DESC, id DESC LIMIT 1').bind(order.id).first();
  if (!availableActions(order, items, payment).includes(action)) {
    throw new ActionError(409, 'Ta akcja nie jest dostępna dla zamówienia w obecnym stanie.');
  }
  const note = str(body.note, 500) || null;

  switch (action) {
    case 'mark_paid': {
      await db.prepare(`UPDATE payments SET status = 'oplacona', updated_at = ? WHERE id = ?`).bind(nowIso(), payment.id).run();
      const r = await finalizeOrder(db, order.id, { source: 'admin', note: note ?? 'Przelew zaksięgowany — potwierdzone ręcznie.' });
      if (!r.finalized) throw new ActionError(409, 'Zamówienie zmieniło się w międzyczasie. Odśwież stronę.');
      return 'Przelew potwierdzony.';
    }
    case 'cancel': {
      if (!(await cancelOrder(db, order.id, { source: 'admin', note: note ?? 'Anulowane przez sklep.' }))) {
        throw new ActionError(409, 'Zamówienie zmieniło się w międzyczasie. Odśwież stronę.');
      }
      return 'Zamówienie anulowane, towar wrócił do sprzedaży.';
    }
    case 'approve_project': {
      const next = items.some((i) => i.product_type === 'physical' || i.product_type === 'service') ? 'w_realizacji' : 'zrealizowane';
      await move(db, order, ['akceptacja_projektu'], next, note ?? 'Klient zaakceptował podgląd projektu.', [
        db.prepare(`UPDATE order_items SET project_status = 'zaakceptowany' WHERE order_id = ? AND project_status IS NOT NULL`).bind(order.id)
      ]);
      return 'Projekt zaakceptowany — zamówienie poszło do realizacji.';
    }
    case 'request_changes': {
      if (!note) throw new ActionError(400, 'Napisz, co trzeba poprawić w projekcie.');
      await db.batch([
        db.prepare(`UPDATE order_items SET project_status = 'do_poprawy' WHERE order_id = ? AND project_status IS NOT NULL`).bind(order.id),
        event(db, order.id, order.status, order.status, `Projekt do poprawy: ${note}`)
      ]);
      return 'Zapisano uwagi do projektu.';
    }
    case 'ship': {
      const pickup = order.shipping_method === 'odbior';
      const tracking = str(body.tracking_number, 40).toUpperCase();
      if (!pickup && !/^[A-Z0-9-]{6,40}$/.test(tracking)) throw new ActionError(400, 'Podaj numer przesyłki z etykiety przewoźnika.');
      const extra = pickup ? [] : [
        db.prepare(`INSERT INTO shipments (order_id, carrier, service, tracking_number, status) VALUES (?, 'inpost', ?, ?, 'nadana')`)
          .bind(order.id, order.shipping_method === 'paczkomat' ? 'inpost_locker_standard' : 'inpost_courier_standard', tracking)
      ];
      await move(db, order, ['w_realizacji'], 'wyslane', pickup ? 'Gotowe do odbioru w punkcie.' : `Nadano, numer przesyłki ${tracking}${note ? ` · ${note}` : ''}`, extra);
      return pickup ? 'Oznaczono jako gotowe do odbioru.' : 'Oznaczono jako wysłane.';
    }
    case 'deliver':
      await move(db, order, ['wyslane'], 'dostarczone', note ?? (order.shipping_method === 'odbior' ? 'Odebrane osobiście.' : 'Doręczone.'), [
        db.prepare(`UPDATE shipments SET status = 'doreczona', updated_at = ? WHERE order_id = ?`).bind(nowIso(), order.id),
        // przy pobraniu kurier oddał pieniądze — płatność rozliczona
        db.prepare(`UPDATE payments SET status = 'oplacona', updated_at = ? WHERE order_id = ? AND provider = 'pobranie' AND status = 'utworzona'`).bind(nowIso(), order.id)
      ]);
      return 'Oznaczono jako dostarczone.';
    case 'complete':
      await move(db, order, ['dostarczone', 'w_realizacji'], 'zrealizowane', note);
      return 'Zamówienie zrealizowane.';
    case 'note':
      if (!note) throw new ActionError(400, 'Notatka jest pusta.');
      await event(db, order.id, order.status, order.status, `Notatka: ${note}`).run();
      return 'Dodano notatkę.';
    case 'refund':
      return refund(env, order, items, payment, body, note);
    default:
      throw new ActionError(400, 'Nieznana akcja.');
  }
}

async function refund(env, order, items, payment, body, note) {
  const db = env.DB;
  const left = payment.amount_gr - payment.refunded_gr;
  const amount = Math.round(Number(body.amount_gr));
  if (!Number.isInteger(amount) || amount <= 0 || amount > left) {
    throw new ActionError(400, `Kwota zwrotu musi być od 0,01 do ${(left / 100).toFixed(2).replace('.', ',')} zł.`);
  }
  const full = amount === left;

  let how;
  if (payment.provider === 'stripe') {
    if (!payment.provider_order) throw new ActionError(409, 'Brak identyfikatora płatności Stripe — zwróć ręcznie w panelu Stripe.');
    await stripeRefund(env, payment.provider_order, amount, `refund-${payment.id}-${payment.refunded_gr}-${amount}`);
    how = 'Zwrot zlecony w Stripe — klient dostanie środki w 5–10 dni.';
  } else if (payment.provider === 'symulator') {
    how = 'Zwrot w bramce testowej.';
  } else {
    // Przelewy24, przelew i pobranie: pieniądze odsyłasz sam, tutaj tylko zapis
    how = payment.provider === 'przelewy24' ? 'Zlecić zwrot w panelu Przelewy24.' : 'Odeślij pieniądze przelewem na konto klienta.';
  }

  const stmts = [
    db.prepare(`UPDATE payments SET refunded_gr = refunded_gr + ?, status = ?, updated_at = ? WHERE id = ?`)
      .bind(amount, full ? 'zwrocona' : 'czesciowo_zwrocona', nowIso(), payment.id)
  ];
  const zl = (gr) => `${(gr / 100).toFixed(2).replace('.', ',')} zł`;
  if (full) {
    stmts.push(db.prepare('UPDATE orders SET status = ? WHERE id = ?').bind('zwrocone', order.id));
    stmts.push(event(db, order.id, order.status, 'zwrocone', `Zwrot ${zl(amount)}. ${how}${note ? ` · ${note}` : ''}`));
    // towar, który nie wyjechał z magazynu albo wrócił — z powrotem na stan
    if (body.restock === true) {
      for (const it of items) {
        if (it.product_type === 'physical') {
          stmts.push(db.prepare('UPDATE variants SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL').bind(it.qty, it.variant_id));
        }
      }
    }
    // pliki cyfrowe i bony przestają działać
    stmts.push(db.prepare(`UPDATE downloads SET expires_at = ? WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)`).bind(nowIso(), order.id));
    stmts.push(db.prepare(`UPDATE gift_cards SET balance_gr = 0 WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?)`).bind(order.id));
  } else {
    stmts.push(event(db, order.id, order.status, order.status, `Częściowy zwrot ${zl(amount)}. ${how}${note ? ` · ${note}` : ''}`));
  }
  await db.batch(stmts);
  return full ? `Zwrócono ${zl(amount)}. ${how}` : `Częściowy zwrot ${zl(amount)}. ${how}`;
}
