import { Decimal } from 'decimal.js';
const D = Decimal.clone({ precision: 100, rounding: Decimal.ROUND_HALF_EVEN });
type NumberFormat = 'indian' | 'international';
function value(input: string) {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(input) || input.length > 256)
    throw new Error('A plain decimal string is required.');
  return new D(input);
}
export function formatDecimal(
  input: string | null,
  places = 2,
  format: NumberFormat = 'indian',
  trim = false,
): string {
  if (input === null) return '—';
  if (!Number.isInteger(places) || places < 0 || places > 18)
    throw new Error('Unsupported display precision.');
  const rounded = value(input).toDecimalPlaces(places);
  const fixed = rounded.abs().toFixed(places);
  const [whole = '', fractional = ''] = fixed.split('.');
  const integer =
    format === 'international'
      ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : whole.length <= 3
        ? whole
        : whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + whole.slice(-3);
  const fraction = trim ? fractional.replace(/0+$/, '') : fractional;
  return (
    (rounded.isNegative() && !rounded.isZero() ? '-' : '') +
    integer +
    (fraction ? '.' + fraction : '')
  );
}
export function formatMoney(
  input: string | null,
  currency = 'INR',
  format: NumberFormat = 'indian',
) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Unsupported currency.');
  if (input === null) return '—';
  const display = formatDecimal(input, 2, format);
  return (
    (display.startsWith('-') ? '-' : '') +
    (currency === 'INR' ? '₹' : currency + ' ') +
    display.replace(/^-/, '')
  );
}
export function formatPercent(input: string | null, format: NumberFormat = 'indian') {
  return input === null ? '—' : formatDecimal(value(input).times(100).toFixed(), 2, format) + '%';
}
export function financialTone(input: string | null): 'positive' | 'negative' | 'neutral' {
  if (input === null) return 'neutral';
  const decimal = value(input);
  return decimal.isZero() ? 'neutral' : decimal.isNegative() ? 'negative' : 'positive';
}
// Decimal-only visual coordinates. Never used for valuation or historical portfolio metrics.
export function pricePlot(prices: readonly string[]) {
  if (!prices.length || prices.length > 400) throw new Error('Unsupported price-series size.');
  const values = prices.map(value),
    low = D.min(...values),
    high = D.max(...values);
  const range = high.minus(low);
  return {
    low: low.toFixed(),
    high: high.toFixed(),
    points: values
      .map(
        (v, i) =>
          new D(i)
            .times(640)
            .div(Math.max(1, values.length - 1))
            .toFixed(3) +
          ',' +
          (range.isZero()
            ? new D(90)
            : new D(180).minus(v.minus(low).div(range).times(180))
          ).toFixed(3),
      )
      .join(' '),
  };
}
