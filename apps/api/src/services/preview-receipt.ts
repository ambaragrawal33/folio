import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../utils/http-error.ts';
export const previewLifetimeMs = 180000;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const scope = z.strictObject({
  owner: z.string(),
  portfolio: z.string(),
  authVersion: z.number().int(),
  requestHash: hash,
  revision: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  instrumentHash: hash,
  fxHash: hash,
  effectsHash: hash,
});
const claims = scope.extend({
  version: z.literal(1),
  issued: z.number().int().nonnegative(),
  expires: z.number().int().nonnegative(),
});
export type PreviewScope = z.infer<typeof scope>;
export function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalValue).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonicalValue(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const previewHash = (value: unknown) =>
  createHash('sha256').update(canonicalValue(value)).digest('hex');
type Sign = (value: string, purpose: string) => string;
export function signPreview(binding: PreviewScope, now: Date, sign: Sign) {
  const payload = Buffer.from(
    JSON.stringify(
      claims.parse({
        ...binding,
        version: 1,
        issued: now.getTime(),
        expires: now.getTime() + previewLifetimeMs,
      }),
    ),
  ).toString('base64url');
  return payload + '.' + sign(payload, 'transaction-preview-v1');
}
export function readPreview(receipt: string, now: Date, sign: Sign) {
  if (!receipt)
    throw new HttpError(428, 'PREVIEW_REQUIRED', 'Review the transaction before confirming it.');
  try {
    if (receipt.length > 2048) throw Error();
    const parts = receipt.split('.'),
      [payload, signature] = parts;
    if (parts.length !== 2 || !payload || !signature || !/^[a-f0-9]{64}$/.test(signature))
      throw Error();
    if (
      !timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(sign(payload, 'transaction-preview-v1'), 'hex'),
      )
    )
      throw Error();
    const result = claims.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (result.expires - result.issued !== previewLifetimeMs || now.getTime() < result.issued)
      throw Error();
    if (now.getTime() >= result.expires)
      throw new HttpError(
        409,
        'PREVIEW_EXPIRED',
        'This review has expired. Revalidate the transaction and review the updated values.',
      );
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(
      409,
      'PREVIEW_INVALID',
      'This review is no longer valid. Revalidate the transaction.',
    );
  }
}
