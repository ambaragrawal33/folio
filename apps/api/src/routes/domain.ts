import { Router } from 'express';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  AppendResponse,
  TransactionPreview,
  EmptyRequest,
  HoldingsQuery,
  LedgerQuery,
  InstrumentQuery,
  InstrumentSearchQuery,
  InstrumentSearchResponse,
  SearchQuery,
  SearchResponse,
  VoidInput,
  VoidResponse,
  HoldingsPage,
  ValuedHolding,
  PriceHistory,
} from '@folio/shared';
import type { Env } from '../config/env.ts';
import type { DomainService } from '../services/domain.ts';
import type { CacheStore } from '../services/cache.ts';
import { HttpError } from '../utils/http-error.ts';
export function domainRouter(env: Env, service: DomainService, cache: CacheStore) {
  const router = Router();
  const origins = new Set([new URL(env.WEB_ORIGIN).origin]);
  if (env.NODE_ENV !== 'production') {
    const origin = new URL(env.WEB_ORIGIN);
    if (['localhost', '127.0.0.1'].includes(origin.hostname))
      for (const host of ['localhost', '127.0.0.1']) {
        origin.hostname = host;
        origins.add(origin.origin);
      }
  }
  const identity = (req: Request) => {
    const value = req.get('authorization') ?? '';
    if (!value.startsWith('Bearer '))
      throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
    return service.auth.authenticate(value.slice(7));
  };
  const parsed = <T>(schema: z.ZodType<T>, value: unknown) => {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new HttpError(400, 'VALIDATION_ERROR', 'Check the supplied fields and filters.');
    return result.data;
  };
  const parameter = (req: Request, key: string) => {
    const value = req.params[key];
    if (typeof value !== 'string')
      throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'This resource is unavailable.');
    return value;
  };
  // Apply only to domain paths so existing auth query/CSRF semantics remain unchanged.
  router.use(async (req, res, next) => {
    const path = req.path.toLowerCase().replace(/\/+$/, '');
    if (!/^\/(portfolios(?:\/|$)|instruments(?:\/search)?$|search$)/.test(path)) {
      next('router');
      return;
    }
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        if (!origins.has(req.get('origin') ?? '') || req.get('X-Folio-CSRF') !== '1')
          throw new HttpError(
            403,
            'CSRF_REJECTED',
            'The security check failed. Reload and try again.',
          );
        if (!req.is('application/json'))
          throw new HttpError(415, 'JSON_REQUIRED', 'Send an application/json request.');
        parsed(EmptyRequest, req.query);
      }
      const user = await identity(req);
      let count: number;
      try {
        count = await cache.increment(
          env.CACHE_NAMESPACE +
            ':domain-limit:' +
            service.auth.digest(
              user.user._id.toHexString() + ':' + (req.ip ?? 'unknown'),
              'domain-limit',
            ) +
            ':' +
            req.method +
            ':' +
            (path === '/search' || path.startsWith('/instruments') ? 'search' : 'portfolio'),
          60,
        );
      } catch {
        throw new HttpError(
          503,
          'LIMITER_UNAVAILABLE',
          'Security services are unavailable. Try again shortly.',
        );
      }
      const cap = req.method === 'GET' ? 60 : 20;
      res.setHeader('RateLimit-Limit', cap);
      res.setHeader('RateLimit-Remaining', Math.max(0, cap - count));
      res.setHeader('RateLimit-Reset', 60);
      if (count > cap) {
        res.setHeader('Retry-After', 60);
        throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.');
      }
      if (user.user.demoReadonly && !['GET', 'HEAD', 'OPTIONS'].includes(req.method))
        throw new HttpError(403, 'DEMO_READ_ONLY', 'This public demo is read-only.');
      res.locals['identity'] = user;
      next();
    } catch (error) {
      next(error);
    }
  });
  // Identity is fetched from the verified token again at each operation; never from client IDs or locals casts.
  router.get('/portfolios', async (req, res) => {
    parsed(EmptyRequest, req.query);
    res.json({ portfolios: await service.portfolios(await identity(req)) });
  });
  router.post('/portfolios/default', async (req, res) => {
    parsed(EmptyRequest, req.body ?? {});
    res.json(await service.createDefault(await identity(req)));
  });
  router.get('/instruments', async (req, res) =>
    res.json({ instruments: await service.instruments(parsed(InstrumentQuery, req.query).q) }),
  );
  router.get('/instruments/search', async (req, res) =>
    res.json(
      InstrumentSearchResponse.parse(
        await service.discover(parsed(InstrumentSearchQuery, req.query)),
      ),
    ),
  );
  router.get('/search', async (req, res) =>
    res.json(
      SearchResponse.parse(
        await service.search(await identity(req), parsed(SearchQuery, req.query).q),
      ),
    ),
  );
  router.get('/portfolios/:portfolioId/ledger', async (req, res) => {
    const q = parsed(LedgerQuery, req.query);
    res.json(
      await service.ledger(
        await identity(req),
        parameter(req, 'portfolioId'),
        q.page,
        q.pageSize,
        q.q,
        q.type,
        q.order,
      ),
    );
  });
  router.post('/portfolios/:portfolioId/ledger', async (req, res) =>
    res.json(
      AppendResponse.parse(
        await service.append(
          await identity(req),
          parameter(req, 'portfolioId'),
          req.body,
          req.get('Idempotency-Key') ?? '',
          req.get('Transaction-Preview') ?? '',
        ),
      ),
    ),
  );
  router.post('/portfolios/:portfolioId/ledger/preview', async (req, res) =>
    res.json(
      TransactionPreview.parse(
        await service.preview(await identity(req), parameter(req, 'portfolioId'), req.body),
      ),
    ),
  );
  router.post('/portfolios/:portfolioId/ledger/:transactionId/void', async (req, res) =>
    res.json(
      VoidResponse.parse(
        await service.void(
          await identity(req),
          parameter(req, 'portfolioId'),
          parameter(req, 'transactionId'),
          parsed(VoidInput, req.body).reason,
        ),
      ),
    ),
  );
  router.get('/portfolios/:portfolioId/valuation', async (req, res) => {
    parsed(EmptyRequest, req.query);
    res.json(await service.valuation(await identity(req), parameter(req, 'portfolioId')));
  });
  router.get('/portfolios/:portfolioId/holdings', async (req, res) =>
    res.json(
      HoldingsPage.parse(
        await service.holdings(
          await identity(req),
          parameter(req, 'portfolioId'),
          parsed(HoldingsQuery, req.query),
        ),
      ),
    ),
  );
  router.get('/portfolios/:portfolioId/holdings/:instrumentId', async (req, res) => {
    parsed(EmptyRequest, req.query);
    res.json(
      ValuedHolding.parse(
        await service.holding(
          await identity(req),
          parameter(req, 'portfolioId'),
          parameter(req, 'instrumentId'),
        ),
      ),
    );
  });
  router.get('/portfolios/:portfolioId/instruments/:instrumentId/history', async (req, res) => {
    parsed(EmptyRequest, req.query);
    res.json(
      PriceHistory.parse(
        await service.history(
          await identity(req),
          parameter(req, 'portfolioId'),
          parameter(req, 'instrumentId'),
        ),
      ),
    );
  });
  return router;
}
