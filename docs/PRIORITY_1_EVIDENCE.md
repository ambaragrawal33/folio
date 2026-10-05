# Priority 1 — local writable valuation evidence

Date **2026-10-05**. Implemented on **codex/phase-3-domain**, inspected starting HEAD **a039bb43b8953eccc94d573febc68e161eace71f**. Only L01 / Priority 1 is authorized and implemented. User review is pending before Priority 2. No deployment, spending, Figma write, main merge, new dependency or financial-engine rewrite. L02 is approved but unimplemented. Local P0 is not yet complete.

## What changed

Explicit local/test fixture configuration, fail-closed startup and actual connection checks; separate Mongo database/Redis DB+namespace/refresh cookie and local signing secrets; pure synthetic market gateway behind the existing interface; strict no-store mode status and verified session flag; visible notice before signup/in product; honest synthetic history/FX copy; local-only Compose profile; integration/browser/isolation tests, CI checks and usage documentation. Existing Decimal ledger, ownership/security and normal/read-only demo policies remain.

Actual visual inspection also found an existing FX-return display unit error. A fractional difference of 0.06626506… must display **6.63 percentage points**, not 0.07. Corrected only the exact formatter and added positive/negative/zero/null and browser assertions. No engine, stored amount, token, hierarchy or layout change. [Design notes](DESIGN_HANDOFF.md), [focused captures](PRIORITY_1_VISUAL_REVIEW.md).

## Actual verification

Logs below are captured command output, not intended results; only terminal trailing padding and line endings are normalized for Git whitespace checks. Coverage is measured from the current implementation. Final lint/format and secret-scan output accompany this record. Existing full check passed before final evidence/document formatting; no application change followed that run.

| Gate / command                                                  | Actual result / evidence                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                    | PASS lint, Figma tokens, Prettier, strict TypeScript, coverage and shared/API/web builds; **116 tests / 14 suites**. [Output](evidence/priority-1/2026-10-05/check.txt)                                                                                                                               |
| Overall coverage                                                | **95.54% lines, 1845/1931; 94.62% statements; 91.94% functions; 89.26% branches**. All four >=70% gates pass. [Measured JSON](evidence/priority-1/2026-10-05/coverage-summary.json)                                                                                                                   |
| Per-file financial-core >=90% lines                             | adapters **96.82% (122/126)**; exact parser **100% (14/14)**; local fixture **100% (20/20)**; Decimal **100% (26/26)**; ledger **100% (108/108)**; valuation **100% (62/62)**; exact formatter **100% (28/28)**. No absent core treated as passed.                                                    |
| `pnpm test:e2e` with normal/demo/fixture stacks                 | **11/11 PASS, 2.6 minutes**, Chromium, one worker. Includes 8 existing regressions and 3 new fixture tests. Real MailHog verification and real Mongo/Redis; no mocked production success/financial API responses. [Output](evidence/priority-1/2026-10-05/e2e.txt)                                    |
| New browser review                                              | **14 states / 28 viewport+full-page PNGs**; zero axe WCAG2A/AA/2.1AA violations, horizontal overflow or independent scroll containers. [Machine results](evidence/priority-1/2026-10-05/visual/browser-checks.json), [gallery](evidence/priority-1/2026-10-05/review.html)                            |
| Existing domain/auth/foundation regressions                     | Financial types/voids/degraded normal valuation/demo/privacy/session/preferences, both-theme source geometry, keyboard/mobile and original 0.5% foundation screenshot gates pass. [Domain audits](evidence/priority-1/2026-10-05/domain-regression-browser-checks.json)                               |
| `node scripts/local-fixture-smoke.mjs`                          | Actual Redis DB1 probe absent from DB0; 3 service readiness/mode flags/no-store; fixture proxy/private401; **6 actual API-process configuration rejections**, exit1 before infrastructure initialization. [Output](evidence/priority-1/2026-10-05/fixture-smoke.txt)                                  |
| `FOLIO_E2E_DEMO=1 node scripts/domain-infrastructure-smoke.mjs` | Writable rs0 primary, multi-document commit/abort, exact 34-digit Decimal128 round trip; **27 OpenAPI operations** and protected financial APIs; unchanged read-only demo hand totals/write403. [Output](evidence/priority-1/2026-10-05/domain-smoke.txt)                                             |
| Infrastructure/auth smokes                                      | Health/readiness/proxy/OpenAPI200, actual MailHog SMTP/API; 20 concurrent Redis increments/TTL; auth CSRF403/private401/no-store; Mongo auth indexes/indexed lookup. [Infrastructure](evidence/priority-1/2026-10-05/infrastructure-smoke.txt), [auth](evidence/priority-1/2026-10-05/auth-smoke.txt) |
| Compose                                                         | **9 running / 8 configured healthchecks healthy**, MailHog SMTP/API separately checked; all published ports loopback. No volume reset/deletion. [Actual state](evidence/priority-1/2026-10-05/compose-health.txt)                                                                                     |
| `pnpm deps:verify`                                              | Node24.19 / pnpm11.19 / TS6.0.3 retained; **490 packages, 82 peer edges, failures[]**. Package manifest/lockfile unchanged. [Output](evidence/priority-1/2026-10-05/dependencies.txt)                                                                                                                 |
| `pnpm audit --audit-level=moderate`                             | **No known vulnerabilities found**. Sandbox DNS denial was rerun with authorized network access; only the successful result is asserted. [Output](evidence/priority-1/2026-10-05/audit.txt)                                                                                                           |
| `node scripts/scan-secrets.mjs`                                 | Trackable working files and full Git history scanned by pinned Gitleaks, redacted; see [final output](evidence/priority-1/2026-10-05/secret-scan.txt). No test session/cookie/credential traces are published in the pack.                                                                            |
| Approved source/baseline preservation                           | Protected token/component/evidence paths have zero Git diff against starting HEAD; **85 existing PNGs** match their stored Git blobs exactly. [Hash manifest](evidence/priority-1/2026-10-05/baseline-preservation.json)                                                                              |

Suite-file concurrency is capped at two to avoid Argon2/replica-set index contention observed during the full run. Request-level concurrency tests remain parallel. No timeout, coverage threshold, test or screenshot tolerance was weakened.

## All 19 required Priority 1 proofs

The new integration tests are in `apps/api/tests/local-fixture.test.ts`, display tests in `apps/web/src/domain/local-fixture.test.tsx`, and actual browser tests in `apps/web/e2e/local-fixture.spec.ts`. [Recorded financial API results](evidence/priority-1/2026-10-05/visual/financial-results.json) contain only synthetic owned test data, no credentials.

| Required proof           | Actual verified result                                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Fresh account          | Real registration, actual MailHog verification link and login; fixture flag true, demo flag absent. No seeded writable identity.                                                                                                                              |
| 2 Portfolio creation     | Real owned default INR/FIFO portfolio through Create portfolio; distinct account/DB ownership.                                                                                                                                                                |
| 3 BUY                    | TCS10×100 + fee10 -> cost1010/value700/unrealized-310; second lot5×120 + fee5 -> cost605.                                                                                                                                                                     |
| 4 SELL                   | Sell12×150 - fee12 -> proceeds1788; FIFO consumed1252; remaining3/cost363; realized536.                                                                                                                                                                       |
| 5 DIVIDEND               | Gross30 - fees/withholding2 -> net income28; units/cost unchanged.                                                                                                                                                                                            |
| 6 SPLIT                  | Manual2:1 -> 6 units, total cost363 preserved; no unsupported cash-in-lieu or automatic action.                                                                                                                                                               |
| 7 Fixture valuation      | Explicit quote70INR / 110USD with source, generated as-of and fixture markers; no live/cache fallback.                                                                                                                                                        |
| 8 Quantities             | TCS6, AAPL10; exact decimal strings and matching remaining lots.                                                                                                                                                                                              |
| 9 Cost basis             | TCS363/average60.5; AAPL local1000/base83000; no engine rewrite.                                                                                                                                                                                              |
| 10 Realized P&L          | TCS536 and aggregate536; exact Decimal result.                                                                                                                                                                                                                |
| 11 Unrealized P&L        | TCS57, AAPL13800; aggregate13857.                                                                                                                                                                                                                             |
| 12 FX                    | Historical USD/INR83 dated2026-01-05; current88; source local-fixture. Price contribution8300, FX contribution5500; local10%, base16.626506…%, display effect6.63pp. Other historical dates reject without booking records.                                   |
| 13 Aggregation           | **97220 value / 83363 remaining cost / 13857 unrealized / 536 realized / 28 income / 1772 current-holdings movement**, coverage2/2. No cash/TWR/XIRR.                                                                                                         |
| 14 Missing               | RELIANCE-only0/1: known subtotal0, total/unrealized null. Missing never becomes zero price/total.                                                                                                                                                             |
| 15 Stale                 | ETH fixture dated2026-01-06; complete-but-stale value125820/cost108346/unrealized17474, explicitly labelled.                                                                                                                                                  |
| 16 Partial               | Add missing RELIANCE ->3/4, subtotal125820; total/unrealized/weights/allocation/concentration null; no renormalization.                                                                                                                                       |
| 17 Normal isolation      | Same email in normal/fixture creates independent identities/portfolios; normal quote null/valuation unavailable; normal cookie unchanged/refresh works; cross-token401/cross-owned-portfolio404. Normal disposable test account erased via privacy flow only. |
| 18 Public demo isolation | Separate demo identity/DB/cache unchanged; fixture login preserves demo cookie and refresh; financial mutation403; fixture↔demo token401. Public demo stays read-only.                                                                                        |
| 19 Fail closed           | Unit configuration matrix, actual wrong Mongo connection rejection, forbidden Live gateway; real API process rejects missing opt-in, production, normal/demo DB, DB0 and remote origin. No infrastructure initialization after invalid configuration.         |

## Reproduce locally

Use [local fixture guide](LOCAL_FIXTURE_MODE.md). Local verification commands:

```powershell
docker compose -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.fixture.yml --profile demo --profile fixture up --build -d --wait
$env:FOLIO_TEST_MONGODB_URI='mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=rs0'
$env:FOLIO_TEST_REDIS_URL='redis://127.0.0.1:6379'
pnpm check
$env:FOLIO_E2E_STACK='1'
$env:FOLIO_E2E_DEMO='1'
$env:FOLIO_E2E_FIXTURE='1'
$env:FOLIO_E2E_EVIDENCE_DIR='.local/priority-1/regression/auth'
$env:FOLIO_DOMAIN_EVIDENCE_DIR='.local/priority-1/regression/domain'
pnpm test:e2e
node scripts/local-fixture-smoke.mjs
node scripts/domain-infrastructure-smoke.mjs
node scripts/infrastructure-smoke.mjs
node scripts/auth-infrastructure-smoke.mjs
pnpm deps:verify
pnpm audit --audit-level=moderate
node scripts/scan-secrets.mjs
```

All browser evidence paths must be new/ignored paths, never approved capture directories. No `--update-snapshots`, volume removal or normal-account fixture toggle. Actual service builds/start were performed locally without deleting existing data.

## Limits and stop boundary

Fixture inputs are synthetic and labelled, not observed/entitled provider evidence. No new instrument coverage, server-authoritative preview, lots/activity UI, JobRunner/refresh infrastructure or portfolio CRUD. Priorities2–6 require subsequent execution/review. News/AI remain separate Phase4/5. Production operations and live Yahoo/CoinGecko gates stay unresolved/deferred. No Mongo restart/500-record final P0 performance claim is made by this gate.

Build still warns at **556.24 kB minified main JS / 167.65 kB gzip**, compared with previous554.74. Warning not suppressed and performance work not pulled ahead of the approved order. New fixture visual states require the user's review; automated checks are not approval. Final commit/clean-tree status is reported separately after recording this evidence. STOP before Priority2.
