# Priority5 — local refresh, recovery and jobs

2026-10-06. Branch `codex/phase-3-domain`, starting clean HEAD `3df46ec1231ab2d50d1afb7caa41b44049ee632a`. Priorities1–4 explicitly CLOSED / APPROVED. Only Priority5 implemented; user review remains required. No Priority6/L02, News/AI, hosting/spending/deployment, Figma write, main merge or early performance optimization.

## Implemented boundary

[Plan](PRIORITY_5_PLAN.md) / [operation, security and exact bounds](LOCAL_JOBS.md). BullMQ6.3.11 and stateless executor share one JobService; Mongo outbox/attempt generations, Redis compare-token leases, crash/stall reconciliation, timeout/backoff/exhaustion and sanitized state. Three types only: price-refresh, permitted eod-close-capture, housekeeping. Bounded owned/recent held instruments; strict opaque queue payload, idempotent admission, per-owner pending cap and distributed publication fencing. No financial mutation API in execution.

Observed quotes/close points retain canonical identity/currency/source/date/basis and Decimal128. Batch preflight rejects identity/currency/mode/duplicate/future/negative/precision failures before publication. A reported zero is distinct from missing/null. Failed/missing responses preserve valid prior observations; freshness ages truthfully. Retention rights are separately gated/default OFF; no normal live provider activation. Fixtures remain explicit/isolated. Historical FX, FIFO, ledger/void/preview/receipt and money formatting are unchanged.

Owned strict/no-store contracts: POST `/api/v1/portfolios/:portfolioId/refresh` (empty JSON, UUID idempotency,202), GET same path (enabled/reason/latest), GET `/:runId` (owned run). Existing auth/Origin/CSRF/Redis limits remain. Local optional HMAC operator endpoint has timestamp/nonce/replay/rate bounds; stateless CLI shares execution. Privacy exports owned job DTOs and erases them atomically; orphan queue IDs do not recreate them.

Dashboard/Holdings/Asset Detail reuse DS controls/status composition. Max seven bounded checks/35-second browser deadline, cancellation, explicit retry and original request ID after uncertain submission. Job status is independently cached; pending cached runs recheck on mount and action waits for status. Financial writes still invalidate financial queries. No continuous price polling or fake success.

## Actual engineering measurements

`pnpm check` PASS: **190 passed /20 suites, two opt-in Docker outage cases skipped in that standard run**. Those cases are separately enabled in the actual **28/28 job test run**. Overall line coverage **93.07%(2619/2814)**; every financial-core file >=90% (minimum95.65%). New observation boundary **96.22%(102/106)**; unchanged Decimal/ledger/valuation/transaction preview/financial formatter100%. Lint, formatting, strict TypeScript, generated token checks and API/web builds pass. Main JS **577.65kB** /gzip173.19kB warning remains unsuppressed/unresolved; no chunk-limit change, early optimization or500-transaction benchmark.

Focused cases include two concurrent workers/same and distinct jobs, broker lock contention/backoff, expiry/compare-token release, hard child-worker kill/stall/application-lease recovery, generation-loss fencing, timeout/cancellation/three-try exhaustion, durable outbox/enqueue failure, duplicate submissions, broker admission/per-owner caps, actual Redis stop/start, actual Mongo stop/start/persistence, scoped GET/POST/CSRF/IDOR/no-store, strict requests/payloads, HMAC unsigned/tamper/expiry/replay/rate, privacy erasure/no recreation, safe errors, price precision, reported zero/missing, partial/unavailable/malformed data, stale ageing and permitted closes. Broker retries solely waiting for a lock correctly report zero executions; no invented attempts.

Twelve refresh UI tests cover pending/disabled/focus, independent status-cache invalidation, cached pending revalidation, bounded status retries/stop, uncertain same-key retry, explicit continuation, unmount abort,35-second deadline, malformed safe error and no finance/history invalidation. Financial snapshots remain unchanged by refresh/close work; real browser ledger equality is checked across initial refresh.

Registry/OSV/frozen install/graph evidence: Node24.19/pnpm11.19/TS6.0.3;498 packages/83 peer edges/no failures. Advisory audit548 records/no vulnerabilities. BullMQ exact-version OSV returns `{}`; optional native msgpack build explicitly denied, JavaScript fallback used. No dependency update beyond pinned BullMQ or security-rule weakening.

## Runtime, review and evidence boundary

Full real-service browser regression **17/17 PASS (6.8 minutes)**, including all existing auth, domain, discovery, fixture, preview, Asset Detail and foundation gates plus two new refresh journeys. The focused refresh UI suite is **12/12 PASS**. **22 states / 44 actual viewport/full-page captures** each have zero axe violations, horizontal overflow and independent scroll containers. Actual worker stop/restart, browser network interruption/retry, normal-account unavailable data, synthetic fresh/stale/missing/partial states and navigation are shown in the [focused visual review](PRIORITY_5_VISUAL_REVIEW.md). Mobile retains the 56px bar and inline menu with no backdrop/scroller, selected route, Escape/ARIA updates, route collapse and hidden desktop context. Light/mobile/tablet and recovery composition remain DERIVED, never Figma-approved. User review is still required to close the gate.

Docker app/worker services are healthy. Infrastructure/auth/domain/fixture smoke checks pass: writable Mongo replica set, commit/rollback and exact Decimal128, Redis and isolated fixture DB1, MailHog, 33 v1 OpenAPI operations, six fixture startup fail-closed cases, real read-only demo totals/write rejection. Real job fault tests explicitly stop and restore Redis and Mongo without deleting volumes and kill/recover a worker. The three-type CLI and idempotent housekeeping retry pass; permitted synthetic close capture records AAPL/TCS on 2026-01-06, accepted 2/5 with missing 3, without pretending to have live closes.

Latest **30 local synthetic job runs**: duration **43.41–192.18 ms**, provider adapter duration **0.00146–0.25580 ms**, lock acquisition **0.575–2.901 ms**, one claimed execution per sampled run, batches 1–3. At observation, waiting/active/delayed/failed counts were zero; 54 broker completions were retained. Fault-run retry/timeout/lock tests are separate from these successful samples. These are local fixture timings, not live-provider latency or production throughput.

Local compiled release image build and smoke **PASS**: non-root runtime; production startup rejects unresolved O02/O04/O06; explicit test-mode compiled API verifies Mongo/Redis readiness, real read-only demo session, exact total215316 and write403. The smoke test now defaults to loopback3030 (strict optional port override) because the fixture API correctly owns3020. No existing Compose port or application behavior was changed. Public HTTPS/proxy/email/backups and deployment are not verified or authorized.

Final evidence commands and actual outputs are below.

Archived terminal text normalizes LF line endings and removes trailing spaces; command values, results and warnings are preserved. Raw logs remain in ignored `.local/priority-5`.

Reproduction (PowerShell, local Docker Desktop on PATH; existing ignored server secrets required for the normal local stack):

```powershell
docker compose -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.fixture.yml -f docker-compose.jobs.yml --profile demo --profile fixture up --build -d --wait --wait-timeout 300
pnpm check
$env:FOLIO_JOB_FAULTS = '1'
pnpm exec vitest run apps/api/tests/jobs.test.ts
Remove-Item Env:FOLIO_JOB_FAULTS
pnpm exec vitest run apps/web/src/domain/RefreshControl.test.tsx
$env:FOLIO_E2E_STACK = '1'
$env:FOLIO_E2E_DEMO = '1'
$env:FOLIO_E2E_FIXTURE = '1'
$env:FOLIO_E2E_JOBS = '1'
$env:FOLIO_E2E_EVIDENCE_DIR = '.local/priority-5/regression/auth'
$env:FOLIO_DOMAIN_EVIDENCE_DIR = '.local/priority-5/regression/domain'
$env:FOLIO_FIXTURE_EVIDENCE_DIR = '.local/priority-5/regression/fixture'
$env:FOLIO_DISCOVERY_EVIDENCE_DIR = '.local/priority-5/regression/discovery'
$env:FOLIO_PREVIEW_EVIDENCE_DIR = '.local/priority-5/regression/preview'
$env:FOLIO_ASSET_EVIDENCE_DIR = '.local/priority-5/regression/asset'
$env:FOLIO_JOBS_EVIDENCE_DIR = '.local/priority-5/visual'
pnpm test:e2e
pnpm deps:verify
pnpm audit --json
```

The fault flag deliberately stops/restores local Redis and Mongo and must only be used against this isolated local verification stack. Baseline-producing test paths stay redirected as shown; do not overwrite accepted evidence.

Final source/documentation checks and pre-commit history scan: [lint](evidence/priority-5/2026-10-06/final-lint.txt), [format](evidence/priority-5/2026-10-06/final-format.txt), [history](evidence/priority-5/2026-10-06/gitleaks-history.txt).

| Command / check                                                                                                                                                                        | Actual result / output                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                                                                                                                           | [190 passed, coverage, lint/format/typecheck/build](evidence/priority-5/2026-10-06/check-final-verified.txt)                                                                                                                                                     |
| Opt-in Docker job fault test run                                                                                                                                                       | [28/28 passed](evidence/priority-5/2026-10-06/faults-verified.txt); overlaps standard tests, not added to the 190 total                                                                                                                                          |
| Refresh UI test run                                                                                                                                                                    | [12/12 passed](evidence/priority-5/2026-10-06/ui-verified.txt)                                                                                                                                                                                                   |
| `pnpm test:e2e` with isolated fixture/jobs Compose profile and new evidence paths                                                                                                      | [17/17 passed](evidence/priority-5/2026-10-06/e2e-pass.txt)                                                                                                                                                                                                      |
| Infrastructure / auth / domain / fixture smoke scripts                                                                                                                                 | [Infrastructure](evidence/priority-5/2026-10-06/infrastructure-smoke.txt), [auth](evidence/priority-5/2026-10-06/auth-smoke.txt), [domain/OpenAPI](evidence/priority-5/2026-10-06/domain-smoke.txt), [fixture](evidence/priority-5/2026-10-06/fixture-smoke.txt) |
| Docker development build / Compose health                                                                                                                                              | [Build](evidence/priority-5/2026-10-06/compose-build-final.txt), [health](evidence/priority-5/2026-10-06/compose-health-final.json)                                                                                                                              |
| `docker build -f Dockerfile.release --target api-runtime -t folio-api-release:priority5 .` / `FOLIO_RELEASE_IMAGE=folio-api-release:priority5 node scripts/release-artifact-smoke.mjs` | [Release build](evidence/priority-5/2026-10-06/release-build.txt), [compiled local smoke](evidence/priority-5/2026-10-06/release-smoke.txt)                                                                                                                      |
| `pnpm deps:verify` / frozen install / `pnpm audit --json` / exact BullMQ OSV lookup                                                                                                    | [Graph](evidence/priority-5/2026-10-06/dependencies-final.txt), [install](evidence/priority-5/2026-10-06/install-current.txt), [audit](evidence/priority-5/2026-10-06/audit-final.json), [OSV](evidence/priority-5/2026-10-06/osv-bullmq.json)                   |
| Stateless CLI housekeeping / matching retry / close capture                                                                                                                            | [Run](evidence/priority-5/2026-10-06/cli-smoke.txt), [retry](evidence/priority-5/2026-10-06/cli-retry-smoke.txt), [closes](evidence/priority-5/2026-10-06/close-cli-smoke.txt)                                                                                   |
| Baseline hashing / connected read-only Figma / metrics                                                                                                                                 | [Preservation](evidence/priority-5/2026-10-06/baseline-preservation.json), [Figma](evidence/priority-5/2026-10-06/figma-source-check.json), [timings](evidence/priority-5/2026-10-06/job-metrics.json)                                                           |
| Pinned Gitleaks 8.30.1 reviewable source scan with unchanged rules                                                                                                                     | [Output](evidence/priority-5/2026-10-06/gitleaks-source.txt), [explicit credential boundary](evidence/priority-5/2026-10-06/source-scan-boundary.json)                                                                                                           |

Remaining limitations: normal live quote/retention entitlements and keyed smoke remain unverified; capability gates stay off. Redis coordinates workers, not financial transactionality; no upstream locking is claimed. A failed refresh retains its accepted dated observation and truthfully ages it. Production scheduler/backup/deployment choices remain deferred. User visual approval, Priority 6 CRUD, News/AI and final local performance acceptance are not inferred from this run.

Existing read-only Figma DS nodes2:4800/2:4895/2:4889 were checked through the connected MCP. Preservation verifies **219 approved PNGs**, tokens/primitives/shell/responsive/auth screens, engine/preview/receipt/formatter, canonical master, fixture prices/source and original Compose files unchanged. Client's only auth-foundation change is optional AbortSignal forwarding for refresh cancellation; session semantics remain unchanged.

Secret-scan boundary: whole-directory scan correctly identifies two generated local auth keys in ignored `.env`. Git confirms `.env` untracked/ignored; values were never printed/exported. Reviewable tracked plus nonignored new source and evidence are scanned at a separate mount root with unchanged Gitleaks rules. History is also scanned. Runtime credential matches are not claimed to be source leaks or silently ignored through new allow rules. Final evidence/source/history outputs record the measured scan sizes and results after documentation assembly.

The new Figma transcript's `fileKey` field caused a generic API-key false positive for the existing public design file identifier. Evidence names that field `designFileIdentifier`, retaining the exact identifier and tool output. No credential was removed, scan path excluded or Gitleaks rule changed.

Implementation fixes found during verification: exact provider-zero compatibility, whole-batch Decimal128 preflight, cached-status action race, redundant job-status invalidation, optional native-build policy, asynchronous lease-release assertion and truthful execution-attempt counts. Older fresh-state browser assertions now perform real refresh; rapid review journeys honor the existing read limit. Original financial/security assertions and approved baselines remain intact. Failed diagnostic passes are retained ignored; final pass logs are the authority.
