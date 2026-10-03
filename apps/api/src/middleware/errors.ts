import type { ErrorRequestHandler } from 'express';
import { ErrorEnvelope } from '@folio/shared';
export type ErrorReporter = (
  event: Readonly<{
    code: 'INTERNAL_ERROR';
    requestId: string;
    status: 500;
  }>,
) => void;
// A future Sentry adapter receives only this allowlisted metadata, never the raw error or request.
export function createErrorHandler(reportError?: ErrorReporter): ErrorRequestHandler {
  return (_err, req, res, _next) => {
    const badJson = _err instanceof SyntaxError && 'body' in _err;
    const tooLarge =
      typeof _err === 'object' &&
      _err !== null &&
      'type' in _err &&
      _err.type === 'entity.too.large';
    const status = badJson ? 400 : tooLarge ? 413 : 500;
    // No request bodies, error stacks/messages, database URI, or credentials in responses/logs.
    req.log?.error(
      { code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST', requestId: req.id },
      'Request failed',
    );
    if (status === 500 && reportError) {
      try {
        reportError(
          Object.freeze({ code: 'INTERNAL_ERROR', requestId: String(req.id), status: 500 }),
        );
      } catch {
        req.log?.warn(
          { code: 'ERROR_REPORTER_FAILED', requestId: req.id },
          'Error reporter failed',
        );
      }
    }
    res.status(status).json(
      ErrorEnvelope.parse({
        error: {
          code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
          message:
            status === 500
              ? 'An unexpected error occurred.'
              : 'The request could not be processed.',
          requestId: req.id,
        },
      }),
    );
  };
}
