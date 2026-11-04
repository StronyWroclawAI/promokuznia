// Wspólne wyliczenia koszyka i zamówienia — ten sam plik importuje front i API.
// Serwer zawsze liczy sam; front używa tego do podglądu sum w koszyku i kasie.

export const FREE_SHIPPING_GR = 30000;
export const COD_FEE_GR = 500;
export const SHIPPING_VAT = 23;

export const SHIPPING_METHODS = {
  paczkomat: { method: 'paczkomat', label: 'Paczkomat InPost 24/7', price_gr: 1399, free_over_threshold: true, needs: 'locker' },
  kurier_inpost: { method: 'kurier_inpost', label: 'Kurier InPost', price_gr: 1699, free_over_threshold: true, needs: 'address' },
  odbior: { method: 'odbior', label: 'Odbiór osobisty we Wrocławiu', price_gr: 0, free_over_threshold: false, needs: 'none' }
};
// skróty używane w opisach produktów
export const SHIPPING = { paczkomat: SHIPPING_METHODS.paczkomat, kurier: SHIPPING_METHODS.kurier_inpost };

export const PAYMENT_METHODS = {
  stripe: { method: 'stripe', label: 'BLIK, karta, Apple Pay, Google Pay', note: 'Bramka Stripe' },
  przelewy24: { method: 'przelewy24', label: 'Przelewy24', note: 'Szybki przelew, BLIK, karta' },
  przelew: { method: 'przelew', label: 'Przelew tradycyjny', note: 'Wysyłka po zaksięgowaniu wpłaty' },
  pobranie: { method: 'pobranie', label: 'Za pobraniem', note: `Płacisz kurierowi, +${(COD_FEE_GR / 100).toFixed(2).replace('.', ',')} zł` }
};

const isPhysical = (l) => l.product.type === 'physical';

export function shippingOptions(lines) {
  const physical = lines.filter(isPhysical);
  if (!physical.length) return [];
  const courierOnly = physical.some((l) => l.product.shipping_class === 'kurier');
  return Object.values(SHIPPING_METHODS).map((m) => ({
    ...m,
    available: !(m.method === 'paczkomat' && courierOnly),
    reason: m.method === 'paczkomat' && courierOnly ? 'W koszyku jest produkt za duży na Paczkomat.' : null
  }));
}

export function paymentOptions(lines, shippingMethod) {
  return Object.values(PAYMENT_METHODS).map((p) => {
    let reason = null;
    if (p.method === 'pobranie' && shippingMethod !== 'kurier_inpost') reason = 'Tylko przy dostawie kurierem.';
    return { ...p, available: !reason, reason };
  });
}

// VAT zawarty w cenie brutto
export const vatFromGross = (gross, rate) => (rate ? Math.round((gross * rate) / (100 + rate)) : 0);

// lines: [{ qty, variant: { price_gr }, product: { type, shipping_class, vat_rate? } }]
// coupon: { code, kind: 'procent'|'kwota'|'darmowa_dostawa', value, min_total_gr } | null
// options: { shipping_method?, payment_method? } — bez nich pokazujemy domyślną (najtańszą) dostawę
export function computeTotals(lines, coupon = null, options = {}) {
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
  const afterDiscount = subtotal - discount;

  const options_ = shippingOptions(lines);
  let shipping = null;
  if (options_.length) {
    const wanted = options_.find((o) => o.method === options.shipping_method && o.available);
    const base = wanted ?? options_.find((o) => o.available && o.method !== 'odbior');
    const free = base.free_over_threshold && (freeShipping || afterDiscount >= FREE_SHIPPING_GR);
    const cod = options.payment_method === 'pobranie' && base.method === 'kurier_inpost' ? COD_FEE_GR : 0;
    shipping = {
      method: base.method,
      label: base.label,
      base_gr: free ? 0 : base.price_gr,
      cod_fee_gr: cod,
      price_gr: (free ? 0 : base.price_gr) + cod,
      courier_only: !options_.find((o) => o.method === 'paczkomat').available,
      chosen: !!wanted
    };
  }

  // VAT: rabat rozkładamy proporcjonalnie na pozycje, dostawa 23%, bony poza VAT
  let vat = 0;
  for (const l of lines) {
    const gross = l.variant.price_gr * l.qty;
    const share = subtotal ? Math.round((discount * gross) / subtotal) : 0;
    // vat_rate === null → bon różnego przeznaczenia (VAT przy realizacji); brak pola → 23%
    vat += vatFromGross(gross - share, l.product.vat_rate === undefined ? 23 : l.product.vat_rate);
  }
  if (shipping) vat += vatFromGross(shipping.price_gr, SHIPPING_VAT);

  return {
    subtotal_gr: subtotal,
    discount_gr: discount,
    shipping,
    total_gr: afterDiscount + (shipping?.price_gr ?? 0),
    vat_gr: vat,
    missing_for_free_shipping_gr: shipping && !freeShipping ? Math.max(0, FREE_SHIPPING_GR - afterDiscount) : 0,
    coupon: couponInfo,
    items_count: lines.reduce((s, l) => s + l.qty, 0)
  };
}
