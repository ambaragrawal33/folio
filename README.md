# Folio

Phase 2 adds real local P0 authentication and account/privacy controls to the approved Phase 1 foundation. Portfolios, financial engines, market data, news, AI and later-tier functionality remain unavailable. Phase 3 requires separate authorization.

The [master-specification audit](docs/PHASE_0_EVIDENCE.md), [design handoff](docs/DESIGN_HANDOFF.md), [decisions](docs/DECISIONS.md), and [Phase 2 evidence](docs/PHASE_2_EVIDENCE.md) record requirements, live Figma provenance, verification and limits.

## Run the local stack

Prerequisites: Git and Docker Desktop with Linux containers/Compose. All exposed services bind to loopback. Keep these unauthenticated development infrastructure services local.

```sh
docker compose up --build -d --wait --wait-timeout 300
```

Open [registration](http://localhost:5173/auth/register), [login](http://localhost:5173/auth/login), the [component gallery](http://localhost:5173/dev/design-system), [API docs](http://localhost:3000/docs/), and [MailHog](http://localhost:8025). Registration sends a real verification email to the local MailHog inbox; open its link and explicitly verify before login. MailHog captures mail locally and does not deliver to an external inbox. Settings saves real profile/preferences, changes passwords, exports JSON/CSV and deletes the account with password plus DELETE confirmation.

Docker needs no production key, host dependency installation or seed. For auth continuity across API restarts, first run `node scripts/init-local-env.mjs` with Node 24. It generates random local keys into ignored .env, preserves existing values and prints no credentials. Compose loads .env as server environment only. Without persisted keys, development uses random per-process keys and existing sessions/action links become invalid after restart; request a new link/sign in again. This fallback is development-only. Never use development keys or MailHog as production configuration.

```sh
docker compose ps
node scripts/infrastructure-smoke.mjs
node scripts/auth-infrastructure-smoke.mjs
docker compose down
```

The smoke commands require Node 24 on the host; the stack itself does not. Named Mongo/Redis volumes persist across down/up. Removing volumes is an explicit local data reset, not part of normal shutdown. Initial network downloads can exceed ten minutes; local timing is not a cold-network guarantee.

On this Windows Codex session Docker's bin directory was missing from inherited PATH. If needed, use a process-only adjustment:

```powershell
$env:PATH = 'C:\\Program Files\\Docker\\Docker\\resources\\bin;' + $env:PATH
docker compose up --build -d --wait --wait-timeout 300
```

## Develop and verify on the host

Use Node **24.19.0 LTS**, pnpm **11.19.0**, TypeScript **6.0.3**. packageManager/engines and strict peer checks enforce this graph.

```sh
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install --frozen-lockfile
docker compose up -d mongo redis mailhog
node scripts/init-local-env.mjs
pnpm dev
```

Do not run host and Docker web/API on the same ports. Stop Docker web/API first when switching workflows. Docker web uses polling for Windows bind mounts; rebuild images after dependency/shared-contract changes, and restart API if its watcher misses a Windows event.

```sh
pnpm tokens:sync
pnpm deps:verify
pnpm test:database
pnpm check
pnpm audit --audit-level=moderate
pnpm exec playwright install chromium
docker compose up --build -d --wait --wait-timeout 300
FOLIO_E2E_STACK=1 pnpm test:e2e
```

In PowerShell use `$env:FOLIO_E2E_STACK='1'; pnpm test:e2e`. Browser tests require real API, Mongo, Redis and MailHog services. Test-database preparation downloads MongoDB 8.2.12 once and verifies an isolated replica set; tests create/drop only random test databases. CI performs this preparation. Windows downloads can exceed the bounded test hook, so preparation is explicit.

pnpm check enforces lint, token freshness, formatting, strict typecheck, coverage and builds. Overall coverage thresholds are 70% for lines/functions/statements/branches. The financial-core 90% line gate reports no implemented financial core in this phase.

Phase 1's user-approved gallery/shell/mobile captures are immutable regression baselines; comparisons retain the 0.5% tolerance and run on Windows, their capture platform. CI uses Windows 2025 for foundation visual/geometry/token/keyboard/axe checks and Ubuntu 24.04 for real-service auth E2E and quality/security gates. New Phase 2 captures are review evidence, not user-approved baselines. Light/mobile remain derived implementations, not Figma-approved.

`node scripts/auth-route-alias-smoke.mjs` verifies actual API/Redis IP/account counters across Express route casing/trailing-slash aliases. Run once per minute with spare IP allowance against the running local stack; the check uses a unique absent test email and creates no account. Rate limits also persist across API restarts.

## Boundaries and auth security

apps/web owns React/Vite/Tailwind primitives and UI. apps/api owns Express infrastructure and auth models/services/providers. packages/shared exports strict contracts and a server-only ./openapi entry point. packages/design-tokens exports generated CSS and source provenance. ESLint rejects cross-app/server imports into the client.

Only explicitly selected Zod-validated environment names enter server configuration. Real .env files, keys, dependencies, logs and caches are ignored. No server secret uses VITE_. Access tokens and account/query state stay in memory; browser storage holds only theme. Errors/logs exclude request bodies, URL queries, stacks and credentials. A synchronous optional reporting hook accepts frozen code/requestId/status only; no external DSN is configured.

Phase 2 uses Argon2id (19MiB, 2 iterations, 1 lane), 15-minute memory-only JWTs, hashed rotating refresh credentials with a 30-day absolute family expiry, and transaction-safe replay revocation. Verification expires after 24 hours; reset after 30 minutes. Purpose-bound links use fragments and require explicit action; hashed tokens are single-use. Reset/change/delete revoke old sessions. Browser refresh is serialized within/across tabs; protected requests recheck active family and user version.

Mutations require JSON, exact Origin and X-Folio-CSRF: 1. Cookies are httpOnly/SameSite=Strict; Secure is required by production policy with an explicit local HTTP exception. Redis limits fail closed; memory limits are an explicit test implementation. Progressive account lockout starts after five failed credentials.

Audit retention is 90 days. JSON/CSV exports include owned public account/audit data and exclude credential hashes/tokens. CSV prefixes dangerous cells. Deletion transactionally cascades all five Phase 2 collections and retains only a deletion event with identity/IP/browser removed. Future financial models must extend export/cascade before shipping.

GET /health and /ready have /api aliases. Readiness verifies writable Mongo replica set and Redis PING, returning explicit 503 on failure. Production email O04, real HTTPS/trusted-proxy configuration and Safari deployment verification remain pending before public auth. The runtime rejects production startup. No production sender/key or public deployment is configured.

## Git and phase workflow

Use codex/phase-N-name branches and conventional commits. Husky runs lint-staged. Commit .env.example only; verify dependencies and scan secrets at each phase boundary. Push/merge/deploy/next-phase actions require their authorization.

CI uses pinned official Actions, frozen install, peer/engine verification, isolated Mongo tests, all quality gates, security audit, real Compose/MailHog browser flows and gitleaks. Dependabot covers npm, Docker and Actions. Canonical remote: https://github.com/ambaragrawal33/folio.git. Main remains Phase 1 until branch review/merge; no deployment workflow is configured. Phase 2 push/hosted results are recorded in its evidence.

See [PROGRESS](docs/PROGRESS.md) for completed scope and deferred work.
