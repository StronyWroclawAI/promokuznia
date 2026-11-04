// Kody rabatowe z panelu: walidacja wspólna dla dodawania i edycji.
// kind: procent (value = %), kwota (value = grosze), darmowa_dostawa (value = 0)

export const KINDS = ['procent', 'kwota', 'darmowa_dostawa'];

export function normalizeCoupon(input) {
  const errors = [];
  if (!input || typeof input !== 'object') return { value: null, errors: ['Brak danych kodu.'] };
  const code = String(input.code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,23}$/.test(code)) errors.push('Kod: 3–24 znaki — litery bez polskich znaków, cyfry, - lub _.');
  const kind = String(input.kind ?? '');
  if (!KINDS.includes(kind)) errors.push('Wybierz rodzaj rabatu: procent, kwota albo darmowa dostawa.');
  let value = Math.round(Number(input.value ?? 0));
  if (kind === 'procent' && !(value >= 1 && value <= 90)) errors.push('Rabat procentowy: od 1 do 90%.');
  if (kind === 'kwota' && !(value >= 100 && value <= 10_000_000)) errors.push('Rabat kwotowy: od 1 zł.');
  if (kind === 'darmowa_dostawa') value = 0;
  const min = Math.round(Number(input.min_total_gr ?? 0));
  if (!(min >= 0 && min <= 10_000_000)) errors.push('Minimalna wartość koszyka nie może być ujemna.');
  if (kind === 'kwota' && value > 0 && min > 0 && value >= min) errors.push('Rabat kwotowy powinien być niższy niż minimalna wartość koszyka.');
  const maxUses = input.max_uses === null || input.max_uses === '' || input.max_uses === undefined ? null : Math.round(Number(input.max_uses));
  if (maxUses !== null && !(maxUses >= 1 && maxUses <= 1_000_000)) errors.push('Limit użyć: liczba od 1 albo puste pole (bez limitu).');
  let validUntil = input.valid_until ? String(input.valid_until) : null;
  if (validUntil) {
    // data z formularza (RRRR-MM-DD) = ważny do końca tego dnia czasu polskiego
    const t = /^\d{4}-\d{2}-\d{2}$/.test(validUntil) ? Date.parse(`${validUntil}T23:59:59+01:00`) : Date.parse(validUntil);
    if (!Number.isFinite(t)) errors.push('Nieprawidłowa data ważności.');
    else validUntil = new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  return {
    errors,
    value: errors.length ? null : { code, kind, value, min_total_gr: min, max_uses: maxUses, valid_until: validUntil, active: input.active !== false }
  };
}
