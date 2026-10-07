# Local P0 jobs and refresh

Priority5 only: no production scheduler/deployment, provider activation, snapshots/backfills/alerts, News/AI or portfolio CRUD. Mongo remains the financial authority; Decimal replay, append/void/preview and historical FX rules are unchanged.

## Operation

Start with `docker compose -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.fixture.yml -f docker-compose.jobs.yml --profile demo --profile fixture up --build -d --wait`. The separate jobs override enables normal and isolated fixture workers; demo gets no worker. Existing volumes remain. Normal5173/demo5180/fixture5190 are unchanged. Scheduler defaults OFF. Worker health requires a recent infrastructure/reconciliation heartbeat and is withdrawn on outage.

Host processes explicitly enable `LOCAL_JOBS_ENABLED=true` with the correct local storage, then `pnpm job:worker`. `pnpm job:run housekeeping <idempotency-key>` uses the same fenced executor through the stateless runner. Only three job names and a bounded ASCII key are accepted. API and worker need the same stable local cache encryption secret when authorized normal provider observations are enabled. Secrets stay in ignored server configuration.

Optional `LOCAL_JOB_SCHEDULES=true` submits every300seconds. Recently active verified users (seven days, max25 portfolios) contribute max25 distinct held canonical instruments. Normal quote refresh requires verified OPEN sessions; permitted close capture requires verified CLOSED sessions. Unknown BSE/year sessions remain unavailable. Close/housekeeping keys are hourly. This is local scheduling, not O06 production readiness.

## Job types and bounds

- `price-refresh`: owned active holdings via existing replay, max25 instruments, one capability-aware batch,60-second recent-observation reuse.
- `eod-close-capture`: latest completed permitted split-adjusted history point only. Unique instrument/date and immutable first accepted close/source/basis. No `adjclose`, guessed official close, backfill or portfolio snapshot. Fixture basis is explicitly synthetic.
- `housekeeping`: already-expired auth/refresh tokens/families, max100 per collection; terminal jobs older30days, max100. Never delete ledger, projections, portfolios or market history.

Mongo `job_runs` is the durable outbox/attempt authority: SHA256 ID, owned scope (operator scope null), state, attempts, generation/deadline, safe error enum, bounded counts/timings. Redis payload is strictly `{runId}`. Atomic admission caps pending IDs at1000; recovery reconciles25 permits/outbox entries at a time. Terminal/erased permits are reclaimed. Broker completed retention max1000/seven days, failed max1000/30days. Existing Redis AOF persists broker state; Mongo outbox recovers enqueue failure.

Defaults:15-second execution deadline,20-second Redis application lease, three attempts; the two retries wait1second then2seconds. The shared exponential backoff helper is capped at5seconds. BullMQ concurrency1 per worker,30-second broker lock/stall scan, max two stalls/six starts. Mongo generation fences replay/overlap. Redis compare-token release prevents an old worker deleting another lease. Exhaustion becomes terminal. No exactly-once upstream call, external-provider lock or Redis financial-transactionality claim.

## Observation safety

Each owned portfolio also has at most20 durable nonterminal runs. The existing user write conflict inside submission's Mongo transaction serializes concurrent admission checks. Same-key retries remain accepted at the cap. Redis broker capacity is distinct from the recoverable Mongo outbox; pending outbox entries survive failed enqueue. UI/API errors direct the user to check an existing refresh rather than submit uncontrolled new work.

`market_observations`: canonical ID/currency, Decimal128 price/reference, source, as-of, observation time, status and fixture flag. Validate the bounded batch before publishing; reject malformed/duplicate/foreign identity, wrong currency/mode, negative price or future timestamp. Missing/failed responses retain valid previous observations. A genuinely reported zero remains distinct from missing/null. No acquisition-cost substitution or normal-account fixture fallback.

Writes use Mongo transactions with current run generation/deadline and Redis lease checks before/after publication. Privacy erasure deletes owned runs in its existing transaction; opaque queued IDs cannot recreate them. These checks do not atomically lock Redis together with Mongo or an external provider. Quote/close execution has no economic-record/void mutation API.

Fixture observations age stale after300seconds; source-reported stale stays stale. Normal observations use existing verified calendar/as-of rules. Failure does not change observation time or make stale data fresh; accepted stale inputs retain prior observation time. Historical FX remains the existing adapter/preview authority.

Display access and durable quote/close retention are separate capabilities. New `YAHOO_OBSERVATION_ENTITLED`, `YAHOO_CLOSE_CAPTURE_ENTITLED`, `COINGECKO_OBSERVATION_ENTITLED` default OFF and require a verified `OBSERVATION_RIGHTS_REFERENCE`; flags grant no rights by themselves. Normal live providers are not activated. Existing CoinGecko shared60/minute and9000/month caps, encrypted cache, single-flight and breaker remain. No secrets/raw exceptions in payloads, run errors, UI or logs.

## API and UI

Job-status cache is separate from financial-domain invalidation. Terminal status may be reused for30seconds; cached pending status is always rechecked on mount, with action disabled during that read. Financial writes still invalidate all existing financial queries. There is no status refetch on window focus. Rapid evidence journeys respect the unchanged60-read/minute server bucket rather than bypassing/increasing it. Reported attempts count actual claimed executions; broker retries caused solely by lock contention do not fabricate execution attempts.

Owned authenticated POST `/api/v1/portfolios/:portfolioId/refresh`: strict empty JSON, UUID `Idempotency-Key`, existing Origin/CSRF/Redis throttling,202 DTO. GET same path returns enabled/reason/latest; GET `/:runId` returns only owned run. All no-store; uniform safe404. Demo writes denied. Same key returns same durable job after uncertain responses. Privacy export includes only owned safe run DTOs.

Optional local POST `/internal/jobs/:name`: configured `JOB_HTTP_SECRET`, strict `{key}`, HMAC-SHA256(method/path/time/UUID nonce/canonical JSON), timing-safe comparison, ±60-second timestamp,120-second single-use nonce, max10 signed submissions/type/minute. Disabled/demo fails closed. Headers redacted. No production scheduler configured.

Dashboard/Holdings/Asset Detail reuse DS tertiary controls/notice hierarchy. Explicit checks use max seven delays1/2/4/5/5/5/5seconds,35-second browser deadline, cancellation on navigation, bounded transient5xx retry and explicit continuation after bound. Pending checks never enqueue another job; uncertain submission retains its UUID. No continuous price polling. Terminal results invalidate active valuation/holdings/detail, not ledger/history. Status/counts and source/as-of stay explicit. Light/mobile/new composition are DERIVED.

Implementation follows BullMQ's [stalled-job model](https://docs.bullmq.io/guide/workers/stalled-jobs), [retry policy](https://docs.bullmq.io/guide/retrying-failing-jobs) and [idempotent-job guidance](https://docs.bullmq.io/patterns/idempotent-jobs). Actual local measurements belong in PRIORITY_5_EVIDENCE.md; this guide does not claim production throughput, provider rights or operational readiness.
