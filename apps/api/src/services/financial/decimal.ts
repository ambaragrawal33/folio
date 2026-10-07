import { Decimal } from 'decimal.js';
import { Types } from 'mongoose';

// Private constructor: provider/UI code cannot mutate the engine's precision or rounding.
export const FinancialDecimal = Decimal.clone({
  precision: 100,
  rounding: Decimal.ROUND_HALF_EVEN,
});
export type Money = Decimal;
export class FinancialError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FinancialError';
    this.code = code;
  }
}
export function decimal(value: string): Money {
  if (
    typeof value !== 'string' ||
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) ||
    value.length > 256
  )
    throw new FinancialError('INVALID_DECIMAL', 'Financial values must be plain decimal strings.');
  return new FinancialDecimal(value);
}
export function serialize(value: Money): string {
  return value.isZero() ? '0' : value.toFixed();
}
export function nonnegative(value: string): Money {
  const parsed = decimal(value);
  if (parsed.isNegative())
    throw new FinancialError('NEGATIVE_VALUE', 'Enter a non-negative value.');
  return parsed;
}
export function positive(value: string): Money {
  const parsed = nonnegative(value);
  if (parsed.isZero()) throw new FinancialError('ZERO_VALUE', 'Enter a value greater than zero.');
  return parsed;
}
export function storedDecimal(value: string, maxPlaces?: number): Types.Decimal128 {
  const parsed = nonnegative(value);
  if (maxPlaces !== undefined && parsed.decimalPlaces() > maxPlaces)
    throw new FinancialError(
      'DECIMAL_SCALE',
      `This value supports at most ${maxPlaces} decimal places.`,
    );
  try {
    return Types.Decimal128.fromString(serialize(parsed));
  } catch {
    throw new FinancialError(
      'DECIMAL_PRECISION',
      'This value exceeds exact database decimal precision.',
    );
  }
}
export function present(value: string, places: number): string {
  if (!Number.isInteger(places) || places < 0 || places > 18)
    throw new FinancialError('DISPLAY_PRECISION', 'Unsupported display precision.');
  const rounded = decimal(value).toDecimalPlaces(places, Decimal.ROUND_HALF_EVEN);
  return (rounded.isZero() ? new FinancialDecimal('0') : rounded).toFixed(places);
}
export function readStoredDecimal(value: Types.Decimal128): string {
  return serialize(new FinancialDecimal(value.toString()));
}
