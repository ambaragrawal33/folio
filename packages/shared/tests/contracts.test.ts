import { openApiDocument } from '../src/openapi';
import { describe, it, expect } from 'vitest';
import {
  DecimalString,
  NumberedPagination,
  CursorPagination,
  ErrorEnvelope,
  ReadyResponse,
  capabilities,
  navigation,
} from '../src/index';
describe('Shared boundaries', () => {
  it('keeps exact decimal strings without numeric coercion', () => {
    expect(DecimalString.parse('12345678901234567890.123456789012345678')).toBe(
      '12345678901234567890.123456789012345678',
    );
    for (const value of [1.5, 'NaN', 'Infinity', '1e9', '01.2', ' 1.2', '1.2.3'])
      expect(DecimalString.safeParse(value).success).toBe(false);
  });
  it('caps pagination and rejects undeclared keys', () => {
    expect(NumberedPagination.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(CursorPagination.parse({})).toEqual({ limit: 25 });
    for (const data of [{ page: 0 }, { page: 1.5 }, { pageSize: 101 }, { userId: 'another-user' }])
      expect(NumberedPagination.safeParse(data).success).toBe(false);
    expect(CursorPagination.safeParse({ limit: 101 }).success).toBe(false);
    expect(CursorPagination.safeParse({ cursor: '' }).success).toBe(false);
  });
  it('rejects leaked error properties and malformed readiness', () => {
    expect(
      ErrorEnvelope.safeParse({
        error: { code: 'X', message: 'x', requestId: 'bad', stack: 'leak' },
      }).success,
    ).toBe(false);
    expect(
      ReadyResponse.safeParse({
        status: 'ready',
        dependencies: { mongo: true, redis: false },
        secret: 'leak',
      }).success,
    ).toBe(false);
  });
  it('exposes only foundation APIs and keeps all product capabilities off', () => {
    expect(Object.values(capabilities).every((v) => v === false)).toBe(true);
    expect(navigation).toHaveLength(12);
    const doc = openApiDocument();
    expect(Object.keys(doc.paths ?? {}).sort()).toEqual([
      '/api/health',
      '/api/openapi.json',
      '/api/ready',
      '/health',
      '/ready',
    ]);
    expect(JSON.stringify(doc)).not.toContain('/auth');
  });
});
