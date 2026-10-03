# Folio

Phase 1 foundation is implemented locally. Authentication, portfolios, market data, news, AI, and later-tier functionality are unavailable. Phase 2 requires separate authorization.

The [master-specification audit](docs/PHASE_0_EVIDENCE.md), [design handoff](docs/DESIGN_HANDOFF.md), [decisions](docs/DECISIONS.md), and [phase evidence](docs/PHASE_1_EVIDENCE.md) record the requirements, live Figma provenance, verification and limits.

## Run the local stack

Prerequisites: Git, Docker Desktop with Linux containers/Compose, and network access for the initial image/package downloads. All exposed services bind to loopback. These unauthenticated development services must stay local.

From a clean checkout:

```sh
docker compose up --build -d --wait --wait-timeout 300
```

Open [Folio](http://localhost:5173), the [component gallery](http://localhost:5173/dev/design-system), [API docs](http://localhost:3000/docs/), and [MailHog](http://localhost:8025). No .env, host pnpm install, API key, user account, or seed is required for this Docker workflow.

```sh
docker compose ps
node scripts/infrastructure-smoke.mjs
docker compose down
```

The smoke command requires Node 24 on the host; the stack itself does not. Named Mongo/Redis volumes persist across down/up. Removing those volumes is an explicit local data reset, not part of normal shutdown.

The first download can exceed ten minutes on a slow connection. The measured isolated checkout startup time and exact image digests are recorded in the Phase 1 evidence. This is a local development stack, not a production deployment.

On this Windows Codex session Docker's bin directory was missing from the inherited PATH. If needed, use a process-only adjustment:

```powershell
$env:PATH = 'C:\Program Files\Docker\Docker\resources\bin;' + $env:PATH
docker compose up --build -d --wait --wait-timeout 300
```

## Develop and verify on the host

Use Node **24.19.0 LTS**, pnpm **11.19.0**, TypeScript **6.0.3**. packageManager and engines pin the supported direction; strict engine/peer checks enforce the resolved graph.

```sh
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
docker compose up -d mongo redis mailhog
```

Copy .env.example to the ignored .env (PowerShell: Copy-Item .env.example .env; POSIX: cp .env.example .env), then:

```sh
pnpm dev
```

Do not run the host web/API and Docker web/API on the same ports. Stop Docker web/API first when switching workflows. Source watch runs on the host; Docker web uses polling for Windows bind mounts. Rebuild the Docker images after changing dependencies or shared contracts, and restart the Docker API if its source watcher misses a Windows file event.

```sh
pnpm tokens:sync
pnpm deps:verify
pnpm check
pnpm audit --audit-level=moderate
pnpm exec playwright install chromium
pnpm test:e2e
```

pnpm check runs lint, deterministic token freshness, formatting, strict typecheck, coverage, and all builds. Overall coverage enforces 70% lines/functions/statements/branches. The financial-core 90% line gate is configured and reports no implemented financial core in this phase. Browser checks compare rendered button fills to captured Figma bindings, measure shell/control geometry, check fonts, run axe in both themes, and exercise keyboard/forms/mobile navigation.

Screenshot evidence is our own implementation output for review. It is not an approved regression baseline. Initial design review is still required before adopting screenshot expectations.

## Boundaries and secrets

apps/web contains React/Vite/Tailwind primitives and the shell; apps/api contains Express infrastructure. packages/shared exports strict contracts and a server-only ./openapi entry point. packages/design-tokens exports generated CSS, geometry/state provenance, and Dark/Light semantic values. ESLint rejects cross-app imports and server/OpenAPI imports into the client.

Server configuration uses explicitly selected Zod-validated environment names. Real .env files, keys, dependencies, logs and caches are ignored. No server secret uses a VITE_ variable. Theme storage holds only a presentation preference; no auth token or user identity is stored. Production startup/provider/email/deployment configuration is deliberately deferred.

GET /health and /ready have /api aliases for the frontend proxy. Readiness checks the writable Mongo replica set and Redis PING; failures are explicit 503 responses. JSON errors include a server-generated UUID and never return stack traces. Request logging excludes URL queries, bodies and raw driver errors, and redacts credential fields. A synchronous Sentry-ready reporting hook accepts only frozen code/requestId/status metadata; no DSN or external monitoring is configured, and a failing reporter cannot break the error response.

MailHog is development email infrastructure. Sending verification/reset messages belongs to Phase 2; no sender or production provider is implemented.

## Git and phase workflow

Use a codex/phase-N-name branch for each authorized phase and small conventional commits. Husky runs lint-staged formatting/lint before committing. Commit .env.example only; run dependency and gitleaks scans before the phase boundary. Do not push, merge, deploy or start another phase without its required authorization.

CI is configured with pinned official Actions, frozen install, engine/peer verification, all local quality gates, dependency audit, browser checks, gitleaks, and a Compose smoke test. Dependabot covers npm, Docker and Actions. There is no deployment workflow or Git remote; no hosted CI run is claimed.

See [PROGRESS](docs/PROGRESS.md) for the phase boundary and deferred work.
