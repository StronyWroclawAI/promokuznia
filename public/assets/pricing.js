// Wspólne wyliczenia koszyka — ten sam plik importuje front i API (functions/_lib/cart.js).
// Serwer zawsze liczy sam; front używa tego tylko w trybie podglądu bez API.

export const FREE_SHIPPING_GR = 30000;
export const SHIPPING = {
  paczkomat: { method: 'paczkomat', label: 'Paczkomat InPost 24/7', price_gr: 1399 },
  kurier: { method: 'kurier_inpost', label: 'Kurier InPost', price_gr: 1699 }
};

// lines: [{ qty, variant: { price_gr }, product: { type, shipping_class } }]
// coupon: { code, kind: 'procent'|'kwota'|'darmowa_dostawa', value, min_total_gr } | null
export function computeTotals(lines, coupon = null) {
  const subtotal = lines.reduce((s, l) => s + l.variant.price_gr * l.qty, 0);

  let discount = 0;
  let freeShipping = false;
  let couponInfo = null;
  if (coupon) {
    if (subtotal < coupon.min_total_gr) {
      couponInfo = { code: coupon.code, ok: false, message: `Kod działa od ${(coupon.min_total_gr / 100).toFixed(0)} zł w koszyku.` };
    } else {
      if (coupon.kind === 'procent') discount = Math.round(subtotal * coupon.value / 100);
      if (coupon.kind === 'kwota') discount = Math.min(coupon.value, subtotal);
      if (coupon.kind === 'darmowa_dostawa') freeShipping = true;
      couponInfo = {
        code: coupon.code,
        ok: true,
        message: coupon.kind === 'procent' ? `−${coupon.value}% na produkty`
          : coupon.kind === 'kwota' ? `−${(coupon.value / 100).toFixed(2).replace('.', ',')} zł`
          : 'Darmowa dostawa'
      };
    }
  }

  const physical = lines.filter((l) => l.product.type === 'physical');
  let shipping = null;
  if (physical.length) {
    const base = physical.some((l) => l.product.shipping_class === 'kurier') ? SHIPPING.kurier : SHIPPING.paczkomat;
    const free = freeShipping || subtotal - discount >= FREE_SHIPPING_GR;
    shipping = { ...base, price_gr: free ? 0 : base.price_gr, courier_only: base === SHIPPING.kurier };
  }

  const afterDiscount = subtotal - discount;
  return {
    subtotal_gr: subtotal,
    discount_gr: discount,
    shipping,
    total_gr: afterDiscount + (shipping?.price_gr ?? 0),
    missing_for_free_shipping_gr: shipping && !freeShipping ? Math.max(0, FREE_SHIPPING_GR - afterDiscount) : 0,
    coupon: couponInfo,
    items_count: lines.reduce((s, l) => s + l.qty, 0)
  };
}
