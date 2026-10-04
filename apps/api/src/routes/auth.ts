import { Router } from 'express';
import type { Request, Response, CookieOptions } from 'express';
import type { z } from 'zod';
import {
  RegisterRequest,
  LoginRequest,
  EmailRequest,
  VerifyRequest,
  ResetRequest,
  ChangePasswordRequest,
  ProfileRequest,
  DeleteAccountRequest,
  EmptyRequest,
  ExportRequest,
  SessionResponse,
} from '@folio/shared';
import type { Env } from '../config/env.ts';
import type { AuthService } from '../services/auth.ts';
import type { RequestMeta } from '../services/auth.ts';
import type { CacheStore } from '../services/cache.ts';
import { HttpError } from '../utils/http-error.ts';
const COOKIE = 'folio_refresh';
const invalid = () => new HttpError(400, 'VALIDATION_ERROR', 'Check the submitted fields.');
function body<T>(schema: z.ZodType<T>, req: Request): T {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw invalid();
  return result.data;
}
function cookieToken(req: Request) {
  const matches = (req.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith(COOKIE + '='));
  if (matches.length !== 1) return '';
  const value = matches[0]!.slice(COOKIE.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
}
export function authRouter(env: Env, service: AuthService, cache: CacheStore) {
  const router = Router();
  const origins = new Set([new URL(env.WEB_ORIGIN).origin]);
  if (env.NODE_ENV !== 'production') {
    const base = new URL(env.WEB_ORIGIN);
    if (['localhost', '127.0.0.1'].includes(base.hostname)) {
      for (const host of ['localhost', '127.0.0.1']) {
        base.hostname = host;
        origins.add(base.origin);
      }
    }
  }
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: 30 * 86400000,
  };
  const clear = (res: Response) => res.clearCookie(COOKIE, { ...cookieOptions, maxAge: 0 });
  const meta = (req: Request): RequestMeta => ({
    ip: req.ip ?? 'unknown',
    userAgent: req.get('user-agent') ?? 'unknown',
  });
  const identity = (req: Request) => {
    const header = req.get('authorization') ?? '';
    if (!header.startsWith('Bearer '))
      throw new HttpError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
    return service.authenticate(header.slice(7));
  };
  router.use(async (req, res, next) => {
    try {
      if (!EmptyRequest.safeParse(req.query).success) throw invalid();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        const origin = req.get('origin');
        if (!origin || !origins.has(origin) || req.get('X-Folio-CSRF') !== '1')
          throw new HttpError(
            403,
            'CSRF_REJECTED',
            'The security check failed. Reload and try again.',
          );
        if (!req.is('application/json'))
          throw new HttpError(415, 'JSON_REQUIRED', 'Send an application/json request.');
      }
      let count: number;
      try {
        count = await cache.increment(
          'folio:limit:' + service.digest(meta(req).ip, 'ip') + ':' + req.method + ':' + req.path,
          60,
        );
      } catch {
        throw new HttpError(
          503,
          'LIMITER_UNAVAILABLE',
          'Security services are unavailable. Try again shortly.',
        );
      }
      const cap = req.method === 'GET' ? 120 : 20;
      res.setHeader('RateLimit-Limit', cap);
      res.setHeader('RateLimit-Remaining', Math.max(0, cap - count));
      res.setHeader('RateLimit-Reset', 60);
      if (count > cap) {
        res.setHeader('Retry-After', 60);
        throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.');
      }
      if (
        req.path.startsWith('/auth/') &&
        req.body &&
        typeof req.body === 'object' &&
        'email' in req.body &&
        typeof req.body.email === 'string'
      ) {
        const parsed = EmailRequest.safeParse({ email: req.body.email });
        if (parsed.success) {
          let accountCount: number;
          try {
            accountCount = await cache.increment(
              'folio:account-limit:' +
                req.path +
                ':' +
                service.digest(parsed.data.email, 'account'),
              60,
            );
          } catch {
            throw new HttpError(
              503,
              'LIMITER_UNAVAILABLE',
              'Security services are unavailable. Try again shortly.',
            );
          }
          if (accountCount > 10) {
            res.setHeader('Retry-After', 60);
            throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.');
          }
        }
      }
      next();
    } catch (error) {
      next(error);
    }
  });
  router.post('/auth/register', async (req, res) =>
    res.json(await service.register(body(RegisterRequest, req), meta(req))),
  );
  router.post('/auth/verify-email', async (req, res) =>
    res.json(await service.verify(body(VerifyRequest, req).token, meta(req))),
  );
  router.post('/auth/resend-verification', async (req, res) =>
    res.json(await service.requestEmail(body(EmailRequest, req).email, 'verify', meta(req))),
  );
  router.post('/auth/forgot-password', async (req, res) =>
    res.json(await service.requestEmail(body(EmailRequest, req).email, 'reset', meta(req))),
  );
  router.post('/auth/login', async (req, res) => {
    const result = await service.login(body(LoginRequest, req), meta(req));
    res
      .cookie(COOKIE, result.refreshToken, cookieOptions)
      .json(SessionResponse.parse(result.response));
  });
  router.post('/auth/refresh', async (req, res) => {
    body(EmptyRequest, req);
    const token = cookieToken(req);
    try {
      const result = await service.refresh(token, meta(req));
      res
        .cookie(COOKIE, result.refreshToken, cookieOptions)
        .json(SessionResponse.parse(result.response));
    } catch (error) {
      clear(res);
      throw error;
    }
  });
  router.post('/auth/logout', async (req, res) => {
    body(EmptyRequest, req);
    const result = await service.logout(cookieToken(req), meta(req));
    clear(res);
    res.json(result);
  });
  router.post('/auth/reset-password', async (req, res) => {
    const input = body(ResetRequest, req);
    const result = await service.reset(input.token, input.password, meta(req));
    clear(res);
    res.json(result);
  });
  router.post('/auth/change-password', async (req, res) => {
    const input = body(ChangePasswordRequest, req);
    const result = await service.changePassword(
      await identity(req),
      input.currentPassword,
      input.password,
      meta(req),
    );
    clear(res);
    res.json(result);
  });
  router.get('/me', async (req, res) =>
    res.json({ user: service.publicUser((await identity(req)).user) }),
  );
  router.patch('/me', async (req, res) =>
    res.json(
      await service.updateProfile(await identity(req), body(ProfileRequest, req), meta(req)),
    ),
  );
  router.post('/me/export', async (req, res) => {
    const input = body(ExportRequest, req),
      data = await service.exportAccount(await identity(req));
    if (input.format === 'csv') {
      const safe = (value: string) => {
        const dangerous = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value);
        return '"' + (dangerous ? "'" + value : value).replaceAll('"', '""') + '"';
      };
      const rows = [
        ['field', 'value'],
        ['id', data.user.id],
        ['name', data.user.name],
        ['email', data.user.email],
        ['role', data.user.role],
        ['emailVerifiedAt', data.user.emailVerifiedAt],
        ['createdAt', data.user.createdAt],
        ['updatedAt', data.user.updatedAt],
        ['exportedAt', data.exportedAt],
        ['scope', data.scope],
        ['timezone', data.user.timezone],
        ['baseCurrency', data.user.baseCurrency],
        ['theme', data.user.preferences.theme],
        ['numberFormat', data.user.preferences.numberFormat],
        ...data.audit.map((a) => ['audit.' + a.action, JSON.stringify(a)]),
      ];
      res.setHeader('Content-Disposition', 'attachment; filename="folio-account.csv"');
      res.type('text/csv').send(rows.map((row) => row.map(safe).join(',')).join('\r\n'));
    } else {
      res.setHeader('Content-Disposition', 'attachment; filename="folio-account.json"');
      res.json(data);
    }
  });
  router.delete('/me', async (req, res) => {
    const input = body(DeleteAccountRequest, req);
    const result = await service.deleteAccount(await identity(req), input.password, meta(req));
    clear(res);
    res.json(result);
  });
  return router;
}
