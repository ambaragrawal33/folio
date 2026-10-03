import { openApiDocument } from '@folio/shared/openapi';
import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { HealthResponse, ReadyResponse, ErrorEnvelope } from '@folio/shared';
import type { Logger } from 'pino';
import type { Env } from './config/env.ts';
import type { Dependencies } from './services/infrastructure.ts';
import { errorHandler } from './middleware/errors.ts';
export function createApp(env: Env, dependencies: Dependencies, logger: Logger) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      }, // Log a fixed route, never a secret-bearing URL/query or an arbitrary error body.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method }),
        res: (res) => ({ statusCode: res.statusCode }),
        err: () => ({ message: 'Request failed' }),
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: false }));
  app.use(express.json({ limit: '64kb' }));
  app.get(['/health', '/api/health'], (_req, res) =>
    res.json(HealthResponse.parse({ status: 'ok' })),
  );
  app.get(['/ready', '/api/ready'], async (_req, res) => {
    let state = { mongo: false, redis: false };
    try {
      state = await dependencies.probe();
    } catch {
      /* Explicit unavailable state. */
    }
    const ready = state.mongo && state.redis;
    res
      .status(ready ? 200 : 503)
      .json(ReadyResponse.parse({ status: ready ? 'ready' : 'unavailable', dependencies: state }));
  });
  const document = openApiDocument();
  app.get('/api/openapi.json', (_req, res) => res.json(document));
  // Swagger assets self-hosted; custom JS comes from this fixed local endpoint under CSP.
  app.get('/docs/swagger-ui-init.js', (_req, res) =>
    res
      .type('application/javascript')
      .send(
        'window.onload=()=>{window.ui=SwaggerUIBundle({url:"/api/openapi.json",dom_id:"#swagger-ui",presets:[SwaggerUIBundle.presets.apis],validatorUrl:null})};',
      ),
  );
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      customSiteTitle: 'Folio API',
      swaggerOptions: { url: '/api/openapi.json' },
    }),
  );
  app.use((req, res) =>
    res.status(404).json(
      ErrorEnvelope.parse({
        error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: req.id },
      }),
    ),
  );
  app.use(errorHandler);
  return app;
}
