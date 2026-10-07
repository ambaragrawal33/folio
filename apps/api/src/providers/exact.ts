import { parse } from 'lossless-json';
import { FinancialDecimal, nonnegative, serialize } from '../services/financial/decimal.ts';
import { ProviderUnavailable } from './transport.ts';
export const parseExact = (text: string): unknown => parse(text, null, (number) => number);
export function exactFinancial(token: string): string {
  if (
    typeof token !== 'string' ||
    token.length > 100 ||
    !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token)
  )
    throw new ProviderUnavailable('INVALID_FINANCIAL_TOKEN');
  const result = new FinancialDecimal(token);
  if (!result.isFinite() || result.e > 100 || result.e < -100)
    throw new ProviderUnavailable('INVALID_FINANCIAL_TOKEN');
  return serialize(result);
}
export function exactPrice(token: string): string {
  const value = exactFinancial(token);
  nonnegative(value);
  return value;
}
export function timestamp(token: string): Date {
  if (!/^\d{1,12}$/.test(token)) throw new ProviderUnavailable('INVALID_TIMESTAMP');
  // Time conversion only. Financial tokens never pass through Number.
  const value = new Date(Number(token) * 1000);
  if (!Number.isFinite(value.getTime())) throw new ProviderUnavailable('INVALID_TIMESTAMP');
  return value;
}
