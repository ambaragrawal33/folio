# Folio

Phase 3 adds owned INR/FIFO portfolios, an immutable Decimal ledger, valuation/coverage, real financial screens and an isolated read-only fixture demo to approved P0 authentication. News, AI and later-tier engines remain unavailable. Phase 3 engineering and visual review are approved; the phase remains open for public deployment and separate operational/provider gates, with no production-readiness claim. [Final visual approval](docs/PHASE_3_VISUAL_APPROVAL.md).

The [master audit](docs/PHASE_0_EVIDENCE.md), [handoff](docs/DESIGN_HANDOFF.md), [decisions](docs/DECISIONS.md), [Phase 3 evidence](docs/PHASE_3_EVIDENCE.md), [visual review](docs/PHASE_3_VISUAL_REVIEW.md) and [deployment boundary](docs/DEPLOYMENT.md) record requirements, actual verification and limits. Light/mobile are derived; Figma is unchanged.

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

## Domain and isolated local demo

Create the default portfolio after normal login and record/review BUY/SELL/DIVIDEND/SPLIT manually. Transactions are immutable and can be voided with a reason if ordered replay stays valid. Historical FX uses actual ECB dates or a provenance-bearing override. Missing prices/FX yield explicit incomplete coverage. Yahoo display defaults off pending rights; CoinGecko requires a safely configured Demo key. No fake/keyless production fallback, cash model or TWR/XIRR.

```sh
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile demo up --build -d --wait --wait-timeout 300
FOLIO_E2E_DEMO=1 node scripts/domain-infrastructure-smoke.mjs
node scripts/provider-adapter-smoke.mjs
docker build -f Dockerfile.release --target api-runtime -t folio-api-release:phase3 .
node scripts/release-artifact-smoke.mjs
```

The dedicated demo at http://localhost:5180/auth/login has real read-only session entry, fixture banner and isolated database/cache; account/financial writes and shared export are denied. Normal accounts at5173 receive no fixtures. [Walkthrough](docs/DEMO.md). Release smoke is local test mode; production startup remains gated and no public URL/hosting account is assumed.

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

For the explicitly enabled **local writable fixture mode**, use [LOCAL_FIXTURE_MODE.md](docs/LOCAL_FIXTURE_MODE.md) and `docker compose -f docker-compose.yml -f docker-compose.fixture.yml --profile fixture up --build -d fixture-api fixture-web`, then open http://127.0.0.1:5190. It uses isolated Mongo/Redis state and cookies, real account/ledger writes and labelled synthetic market inputs. It is not normal mode, a live-provider fallback or the read-only demo. Normal mode remains http://127.0.0.1:5173; read-only demo remains http://127.0.0.1:5180.

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

pnpm check enforces lint, token freshness, formatting, strict typecheck, coverage and builds. Overall coverage thresholds are70% for lines/functions/statements/branches; every measured financial-core file must reach90% lines and an absent core measurement fails. Real integration/coverage uses FOLIO_TEST_MONGODB_URI=mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=rs0 and FOLIO_TEST_REDIS_URL=redis://127.0.0.1:6379. Browser domain/demo verification requires both Compose profiles plus FOLIO_E2E_STACK=1/FOLIO_E2E_DEMO=1. Set FOLIO_E2E_EVIDENCE_DIR=.local/phase-2-regression to preserve approved Phase2 captures.

Phase 1's user-approved gallery/shell/mobile captures are immutable regression baselines; comparisons retain the 0.5% tolerance and run on Windows, their capture platform. CI uses Windows 2025 for foundation visual/geometry/token/keyboard/axe checks and Ubuntu 24.04 for real-service auth E2E and quality/security gates. New Phase 2 captures are review evidence, not user-approved baselines. Light/mobile remain derived implementations, not Figma-approved.

`node scripts/auth-route-alias-smoke.mjs` verifies actual API/Redis IP/account counters across Express route casing/trailing-slash aliases. Run once per minute with spare IP allowance against the running local stack; the check uses a unique absent test email and creates no account. Rate limits also persist across API restarts.

## Boundaries and auth security

apps/web owns React/Vite/Tailwind primitives and UI. apps/api owns Express infrastructure and auth models/services/providers. packages/shared exports strict contracts and a server-only ./openapi entry point. packages/design-tokens exports generated CSS and source provenance. ESLint rejects cross-app/server imports into the client.

Only explicitly selected Zod-validated environment names enter server configuration. Real .env files, keys, dependencies, logs and caches are ignored. No server secret uses VITE_. Access tokens and account/query state stay in memory; browser storage holds only theme. Errors/logs exclude request bodies, URL queries, stacks and credentials. A synchronous optional reporting hook accepts frozen code/requestId/status only; no external DSN is configured.

Phase 2 uses Argon2id (19MiB, 2 iterations, 1 lane), 15-minute memory-only JWTs, hashed rotating refresh credentials with a 30-day absolute family expiry, and transaction-safe replay revocation. Verification expires after 24 hours; reset after 30 minutes. Purpose-bound links use fragments and require explicit action; hashed tokens are single-use. Reset/change/delete revoke old sessions. Browser refresh is serialized within/across tabs; protected requests recheck active family and user version.

Mutations require JSON, exact Origin and X-Folio-CSRF: 1. Cookies are httpOnly/SameSite=Strict; Secure is required by production policy with an explicit local HTTP exception. Redis limits fail closed; memory limits are an explicit test implementation. Progressive account lockout starts after five failed credentials.

Audit retention is90 days. JSON/CSV exports include owned public account/audit/domain records and exclude credentials. CSV prefixes dangerous cells. Deletion transactionally cascades auth plus owned portfolio/ledger/void/projection collections, serializes against writes and retains only a deletion event with identity/IP/browser removed.

GET /health and /ready have /api aliases. Readiness verifies writable Mongo replica set and Redis PING, returning explicit 503 on failure. Production email O04, real HTTPS/trusted-proxy configuration and Safari deployment verification remain pending before public auth. The runtime rejects production startup. No production sender/key or public deployment is configured.

## Git and phase workflow

Use codex/phase-N-name branches and conventional commits. Husky runs lint-staged. Commit .env.example only; verify dependencies and scan secrets at each phase boundary. Push/merge/deploy/next-phase actions require their authorization.

CI uses pinned official Actions, frozen install, peer/engine verification, isolated Mongo tests, all quality gates, security audit, real Compose/MailHog browser flows and gitleaks. Dependabot covers npm, Docker and Actions. Canonical remote: https://github.com/ambaragrawal33/folio.git. Main remains Phase 1 until branch review/merge; no deployment workflow is configured. Phase 2 push/hosted results are recorded in its evidence.

See [PROGRESS](docs/PROGRESS.md) for completed scope and deferred work.
