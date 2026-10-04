import { z } from 'zod';
export const NumberedPagination = z.strictObject({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export const CursorPagination = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
