# Folio

**Phase 0 audit and planning only. No runnable application exists. Phase 1 has not started.**

The entire supplied master specification (1,141 lines) was read before the audit. Its SHA-256 and actual commands/results are in [Phase 0 evidence](docs/PHASE_0_EVIDENCE.md). The live connected [Figma design](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=0-1) was inspected read-only.

Start review with [PROGRESS](docs/PROGRESS.md), [DESIGN_HANDOFF](docs/DESIGN_HANDOFF.md), [pending decisions versus confirmed requirements](docs/DECISIONS.md), [architecture and phase milestones](docs/ARCHITECTURE.md), and [provider/dependency verification](docs/PROVIDER_AUDIT.md). [FRAME_INVENTORY](docs/FRAME_INVENTORY.md) lists every enumerated frame. [DEMO](docs/DEMO.md) is a future walkthrough and smoke plan.

Docker/Compose is missing. Node 24.19.0 LTS, pnpm 11.19.0, Git 2.56.0.windows.1 and Corepack 0.35.0 execute. pnpm currently comes from Codex's runtime fallback, so Phase 1 must pin a portable project packageManager. Latest TypeScript 7.0.2 conflicts with the audited TypeScript ESLint peer range; 6.0.3 is the proposed compatible pin. No packages were installed.

## Running status

There is no package.json, lockfile, app, Compose stack or CI workflow yet. Therefore no clean-clone run/build/test instructions can honestly be executed at this phase. After Phase 0 approval and toolchain completion, Phase 1 will supply the ≤10-minute clean-clone workflow, generated token sync and actual validation commands.

Suggested Docker install (not executed): `winget install --exact --id Docker.DockerDesktop`. Launch Docker Desktop with WSL2 and verify `docker --version`, `docker compose version`, `docker info`. See [official Windows setup](https://docs.docker.com/desktop/setup/install/windows-install/) and the audit for prerequisites. Tool installation requires approval.

## Planned environment matrix

Names only; no secret values requested or read. .env.example will be created in Phase 1; real .env files remain ignored. Server validates required values at startup. Client must never receive server secrets through Vite variables.

| Variable | Planned use / required when |
|---|---|
| NODE_ENV, PORT | API environment/port; Phase 1 |
| MONGODB_URI | Local replica set then Atlas; Phase 1/first deploy |
| REDIS_URL | Local jobs/cache; required in deployment for distributed limits (spec's “optional” env wording conflicts with its security requirement) |
| JWT_ACCESS_SECRET, REFRESH_TOKEN_SECRET | Distinct strong server secrets; Phase 2 |
| ENCRYPTION_KEY | 32-byte key for stored sensitive configuration/2FA; validated encoding; Phase 2/8 |
| CORS_ORIGIN | Exact approved origin; same-origin proxy at deployment |
| JOB_TRIGGER_SECRET | HMAC/shared-secret job endpoints; Phase 3 jobs/deploy |
| COINGECKO_DEMO_API_KEY | Header-based Demo access; Phase 3 |
| FINNHUB_API_KEY / TWELVEDATA_API_KEY | Optional entitled fallback only; Phase 3 |
| NEWSAPI_KEY | Optional paid entitled production alternative; free Developer not public production; Phase 4 |
| LLM_PROVIDER, LLM_API_KEY, LLM_MODEL | Production AI selection/key/model; Phase 5; dev/tests explicit mock only |
| EMAIL_PROVIDER + provider-specific credentials/sender | Console/MailHog dev; explicitly chosen production email before live auth |
| SENTRY_DSN | Optional redacted error integration, no DSN needed to scaffold |
| DEMO_MODE | Explicit isolated deterministic domain-engine fixtures + visible banner |

Credential configuration must use ignored local files or host secret managers. No remote exists; no code was pushed or deployed. Deployment is manually approved per phase. Both-theme Figma fidelity, current provider rights/limits and real browser auth smoke remain future gates.

Phase 0 stops at the approval boundary recorded in PROGRESS. Proposed defaults are not confirmed decisions.
