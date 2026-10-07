import { expect, it } from 'vitest';
import {
  formatDecimal,
  formatMoney,
  formatPercent,
  financialTone,
  pricePlot,
} from '../src/financial-format.ts';
it('formats exact strings without converting financial values to numbers', () => {
  expect(formatMoney('215316')).toBe('₹2,15,316.00');
  expect(formatMoney('-1234567.995', 'USD', 'international')).toBe('-USD 1,234,568.00');
  expect(formatMoney('123456789012345678901234567890.125')).toBe(
    '₹1,23,45,67,89,01,23,45,67,89,01,23,45,67,890.12',
  );
  expect(formatDecimal('1.235')).toBe('1.24');
  expect(formatDecimal('1.225')).toBe('1.22');
  expect(formatDecimal('-0.004')).toBe('0.00');
  expect(formatDecimal('0.000000000000000001', 18, 'international', true)).toBe(
    '0.000000000000000001',
  );
  expect(formatDecimal('1.2300', 10, 'indian', true)).toBe('1.23');
  expect(formatDecimal('0', 0)).toBe('0');
  expect(formatPercent('0.12345')).toBe('12.34%');
  expect(formatPercent('0.12355', 'international')).toBe('12.36%');
  expect([formatMoney(null), formatDecimal(null), formatPercent(null)]).toEqual(['—', '—', '—']);
  expect([
    financialTone(null),
    financialTone('0'),
    financialTone('-1'),
    financialTone('1'),
  ]).toEqual(['neutral', 'neutral', 'negative', 'positive']);
  for (const bad of ['1e6', 'NaN', '01', '1,000', '0'.repeat(257)])
    expect(() => formatDecimal(bad)).toThrow();
  for (const bad of [-1, 19, 1.5]) expect(() => formatDecimal('1', bad)).toThrow();
  expect(() => formatMoney('1', 'bad')).toThrow();
});
it('uses exact Decimal coordinates for observed charts without introducing monetary float arithmetic', () => {
  expect(pricePlot(['100', '150', '200'])).toEqual({
    low: '100',
    high: '200',
    points: '0.000,180.000 320.000,90.000 640.000,0.000',
  });
  expect(pricePlot(['0'])).toEqual({ low: '0', high: '0', points: '0.000,90.000' });
  expect(() => pricePlot([])).toThrow();
  expect(() => pricePlot(Array<string>(401).fill('1'))).toThrow();
});
