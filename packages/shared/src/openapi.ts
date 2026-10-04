import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { DecimalString, ErrorEnvelope, HealthResponse, ReadyResponse } from './index.ts';
import { authContracts } from './auth.ts';
type OasSchema = NonNullable<
  NonNullable<ReturnType<OpenApiGeneratorV3['generateDocument']>['components']>['schemas']
>[string];
// Zod's general JSON Schema type is wider than OAS3. The explicit serializer
// target guarantees the OAS3 dialect; this assertion narrows only that output.
function schemaFor(schema: z.ZodType): OasSchema {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as OasSchema;
}
export function openApiDocument(): ReturnType<OpenApiGeneratorV3['generateDocument']> {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('schemas', 'DecimalString', schemaFor(DecimalString));
  registry.registerComponent('schemas', 'ErrorEnvelope', schemaFor(ErrorEnvelope));
  registry.registerComponent('schemas', 'HealthResponse', schemaFor(HealthResponse));
  registry.registerComponent('schemas', 'ReadyResponse', schemaFor(ReadyResponse));
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  registry.registerComponent('securitySchemes', 'refreshCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: 'folio_refresh',
  });
  for (const contract of authContracts) {
    registry.registerPath({
      method: contract.method,
      path: contract.path,
      summary: contract.path.split('/').at(-1) ?? 'Account',
      description:
        'Strict request schema. Mutations require Origin matching WEB_ORIGIN, X-Folio-CSRF: 1, and application/json. Access tokens are memory-only; refresh cookies are httpOnly and SameSite=Strict. All responses are no-store. Account identity comes from the authenticated token, never request fields.',
      security: contract.authenticated
        ? [{ bearerAuth: [] }]
        : contract.path.endsWith('/refresh')
          ? [{ refreshCookie: [] }]
          : [],
      ...(contract.method === 'get'
        ? {}
        : {
            request: {
              body: {
                required: true,
                content: { 'application/json': { schema: schemaFor(contract.request) } },
              },
            },
          }),
      responses: {
        200: {
          description: 'Success (email requests are deliberately generic)',
          content: {
            'application/json': { schema: schemaFor(contract.response) },
            ...(contract.path.endsWith('/export')
              ? { 'text/csv': { schema: { type: 'string' as const } } }
              : {}),
          },
        },
        400: {
          description: 'Invalid fields or invalid/expired single-use token',
          content: { 'application/json': { schema: schemaFor(ErrorEnvelope) } },
        },
        401: {
          description: 'Authentication expired/invalid credentials',
          content: { 'application/json': { schema: schemaFor(ErrorEnvelope) } },
        },
        403: {
          description: 'CSRF/origin rejected or email not verified',
          content: { 'application/json': { schema: schemaFor(ErrorEnvelope) } },
        },
        429: {
          description: 'Rate limited; Retry-After and RateLimit headers returned',
          content: { 'application/json': { schema: schemaFor(ErrorEnvelope) } },
        },
        415: {
          description: 'Mutations require application/json',
          content: { 'application/json': { schema: schemaFor(ErrorEnvelope) } },
        },
        500: {
          description: 'Redacted unexpected error',
          content: { 'application/json': { schema: schemaFor(ErrorEnvelope) } },
        },
        503: {
          description: 'Security service unavailable; fail closed',
          content: { 'application/json': { schema: schemaFor(ErrorEnvelope) } },
        },
      },
    });
  }
  const error = {
    description: 'Redacted error',
    content: { 'application/json': { schema: ErrorEnvelope } },
  };
  registry.registerPath({
    method: 'get',
    path: '/api/health',
    summary: 'Process liveness',
    responses: {
      200: { description: 'Running', content: { 'application/json': { schema: HealthResponse } } },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/ready',
    summary: 'Mongo replica-set and Redis readiness',
    responses: {
      200: { description: 'Ready', content: { 'application/json': { schema: ReadyResponse } } },
      503: {
        description: 'Dependencies unavailable',
        content: { 'application/json': { schema: ReadyResponse } },
      },
      500: error,
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/api/openapi.json',
    summary: 'Implemented API contract',
    responses: { 200: { description: 'OpenAPI document' } },
  });
  registry.registerPath({
    method: 'get',
    path: '/health',
    summary: 'Process liveness (operational alias)',
    responses: {
      200: { description: 'Running', content: { 'application/json': { schema: HealthResponse } } },
    },
  });
  registry.registerPath({
    method: 'get',
    path: '/ready',
    summary: 'Dependency readiness (operational alias)',
    responses: {
      200: { description: 'Ready', content: { 'application/json': { schema: ReadyResponse } } },
      503: {
        description: 'Unavailable',
        content: { 'application/json': { schema: ReadyResponse } },
      },
    },
  });
  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: { title: 'Folio API', version: '0.2.0' },
  });
}
