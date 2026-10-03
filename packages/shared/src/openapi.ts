import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { DecimalString, ErrorEnvelope, HealthResponse, ReadyResponse } from './index.ts';
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
    info: { title: 'Folio Foundation', version: '0.1.0' },
  });
}
