// Monetary units stay exact in their original currency. No FX or implicit rounding.
export function currencyMinorDigits(currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return null;
  if (typeof Intl.supportedValuesOf === 'function' && !Intl.supportedValuesOf('currency').includes(currency)) return null;
  const digits = new Intl.NumberFormat('en', {style:'currency',currency}).resolvedOptions().maximumFractionDigits;
  return Number.isInteger(digits) && digits >= 0 && digits <= 3 ? digits : null;
}
export function decimalToMinor(decimal, currency) {
  const digits = currencyMinorDigits(currency);
  if (digits === null || typeof decimal !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(decimal)) return null;
  const negative = decimal.startsWith('-'), [whole, fraction=''] = decimal.replace(/^-/, '').split('.');
  if (fraction.length > digits) return null;
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits,'0') || '0');
  const result = Number(negative ? -minor : minor);
  return Number.isSafeInteger(result) ? result : null;
}
export function formatFinancialMinor(minor, currency, locale='pt-BR') {
  const digits = currencyMinorDigits(currency);
  if (digits === null || !Number.isSafeInteger(minor)) return null;
  return new Intl.NumberFormat(locale,{style:'currency',currency}).format(minor / 10 ** digits);
}
