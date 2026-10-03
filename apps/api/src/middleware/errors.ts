import type { ErrorRequestHandler } from 'express';
import { ErrorEnvelope } from '@folio/shared';
export const errorHandler: ErrorRequestHandler = (_err, req, res, _next) => {
  const badJson = _err instanceof SyntaxError && 'body' in _err;
  const tooLarge =
    typeof _err === 'object' && _err !== null && 'type' in _err && _err.type === 'entity.too.large';
  const status = badJson ? 400 : tooLarge ? 413 : 500;
  // No request bodies, error stacks/messages, database URI, or credentials in responses/logs.
  req.log?.error(
    { code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST', requestId: req.id },
    'Request failed',
  );
  res.status(status).json(
    ErrorEnvelope.parse({
      error: {
        code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
        message:
          status === 500 ? 'An unexpected error occurred.' : 'The request could not be processed.',
        requestId: req.id,
      },
    }),
  );
};
