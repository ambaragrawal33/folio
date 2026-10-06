# Priority 6 — single-default portfolio management

2026-10-06. Branch `codex/phase-3-domain`, starting clean HEAD `7a4a548571ddc618adb40420a7d619e586b70f11`. Priorities1–5 explicitly CLOSED / APPROVED. Only Priority6 implemented; user engineering/visual review remains required. No News/AI, hosting/spending/deployment, provider activation, main merge or early optimization.

## Implemented and protected

[Inspected plan](PRIORITY_6_PLAN.md), [exact API/concurrency/privacy guide](PORTFOLIO_MANAGEMENT.md). Strict authenticated owned management GET, rename PATCH and empty-only DELETE; independent metadata version, repeat-safe rename, explicit DELETE confirmation and durable scoped UUID receipt. The same Mongo user write guard serializes create/append/void/management/refresh admission/privacy erasure. Stable payload hashes survive development secret rotation. Changed versions/payloads reject safely; matching retries cannot remove a replacement.

Any original economics, voids, projection, financial revision/sequence/lock/dirty timestamp prevents deletion. Sold/voided history stays immutable. Only an empty portfolio row is removed; no void substitute/force/cascade. New default creation is explicit with a new ID and existing INR/FIFO rules. Prior audit history, shared instruments/market observations/history and owned operational job history remain. Account privacy export includes safe deletion IDs/times in JSON/CSV and erasure removes owned receipts/history under its separate existing transaction.

Settings uses existing fields/controls and natural document flow. Rename updates the owned list immediately without clearing financial caches. Confirm/cancel/notice focus, safe error copy, static described history block, unverified/mis-scoped response rejection, same-key uncertain retry, scoped cancellation/cache removal and stale first-flow recovery are implemented. No new design tokens/assets/palette/CSS geometry or account model.

## Actual measured gates

Full `pnpm check` **PASS:218 passed /22 suites; two opt-in Docker outage cases skipped there and independently exercised in28/28 dedicated jobs/outage tests**. Overall line coverage **93.44% (2796/2992)**; statements92.34%, branches88.46%, functions91.41%. Every implemented financial-core file >=90% (minimum95.65%); observations96.22%, unchanged Decimal/ledger/valuation/preview/formatter100%. New focused management cases:16 backend and12 UI. No financial-core gate or test limit weakened.

Lint/format/strict TypeScript/token checks/API+web builds pass. JS **584.92kB /175.15kB gzip**, CSS98.97kB. The chunk warning remains unresolved and unsuppressed; no chunk-limit change, early optimization or500-transaction benchmark.

Real-service Mongo replica-set multi-document commit/rollback and Decimal128, Redis atomic counters, MailHog/auth/CSRF, **36 v1 OpenAPI operations**, unchanged read-only demo hand totals/write403, six fixture startup fail-closed checks and local Compose build/health pass. Graph **498 packages/83 peer edges/no failures**; fresh dependency audit548 records/no advisory. No new dependency or live-provider acceptance.

Full real-service browser regression **20/20 PASS (10.3 minutes)**, including three new management journeys. **25 focused states / 50 actual captures**, zero axe violations, horizontal overflow or independent scrolling. Real API restart/reauthentication and logout/login preserve the name; empty deletion returns404 afterward; a new explicit default has a different ID; populated deletion409 leaves the ledger unchanged. Actual committed deletion with a lost response safely retries its original key after a replacement exists. Stale Settings recovers without fake deletion success. [Focused visual review](PRIORITY_6_VISUAL_REVIEW.md) requires separate user approval; Light/mobile/tablet and new workflows remain DERIVED, never Figma-approved.

Local non-root compiled release artifact **PASS**: Mongo/Redis readiness, exact read-only demo total215316 and write403. Unresolved production configuration correctly fails startup; no public deployment or HTTPS/proxy/email/backup readiness is claimed. Pinned Gitleaks8.30.1 finds no leaks in reviewable source/evidence or24 pre-commit history commits; ignored generated runtime secrets are excluded as documented below. Final11-service Compose health is recorded.

## Commands and actual outputs

Final source/documentation [lint](evidence/priority-6/2026-10-06/final-lint.txt) and [format](evidence/priority-6/2026-10-06/final-format.txt) pass. [Rendered gallery probe](evidence/priority-6/2026-10-06/gallery-probe.json) verifies HTTP200,25 sections and all50 actual images loaded with exact viewport dimensions. Local gallery: `http://127.0.0.1:5406/review.html`. Final Compose evidence is11 running services,10 configured Docker healthchecks healthy; MailHog has no container healthcheck and passes its actual SMTP/API smoke.

| Verification                              | Actual output                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full lint/format/typecheck/coverage/build | [pnpm check](evidence/priority-6/2026-10-06/check-final.txt), [coverage](evidence/priority-6/2026-10-06/coverage-summary.json)                                                                                                                                               |
| Focused backend/UI and real job faults    | [28 management cases](evidence/priority-6/2026-10-06/focused-final.txt), [28 jobs/outage cases](evidence/priority-6/2026-10-06/jobs-faults.txt)                                                                                                                              |
| Full browser regression                   | [20 E2E journeys](evidence/priority-6/2026-10-06/e2e-full-final.txt), [management persistence/results](evidence/priority-6/2026-10-06/visual/journey-results.json)                                                                                                           |
| Local Docker                              | [build/up](evidence/priority-6/2026-10-06/compose-build-up.txt), [health](evidence/priority-6/2026-10-06/compose-health-final.json)                                                                                                                                          |
| Real services/contracts                   | [infrastructure](evidence/priority-6/2026-10-06/infrastructure-smoke.txt), [auth](evidence/priority-6/2026-10-06/auth-smoke.txt), [domain/OpenAPI](evidence/priority-6/2026-10-06/domain-smoke.txt), [fixture fail-closed](evidence/priority-6/2026-10-06/fixture-smoke.txt) |
| Dependencies                              | [peer graph](evidence/priority-6/2026-10-06/dependencies.txt), [fresh audit](evidence/priority-6/2026-10-06/audit.json)                                                                                                                                                      |
| Release artifact                          | [build](evidence/priority-6/2026-10-06/release-build.txt), [local smoke](evidence/priority-6/2026-10-06/release-smoke.txt)                                                                                                                                                   |
| Preservation and design                   | [protected hashes](evidence/priority-6/2026-10-06/baseline-preservation.json), [connected read-only Figma](evidence/priority-6/2026-10-06/figma-source-check.json)                                                                                                           |
| Secrets                                   | [reviewable source](evidence/priority-6/2026-10-06/gitleaks-source.txt), [history](evidence/priority-6/2026-10-06/gitleaks-history.txt), [scope](evidence/priority-6/2026-10-06/source-scan-boundary.json)                                                                   |

Reproduction uses the existing isolated local services and ignored local configuration. The optional job fault flag intentionally stops/restores local Mongo/Redis; never use it against shared/production services. Redirect all capture paths to new evidence locations, preserving accepted baselines.

```powershell
docker compose -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.fixture.yml -f docker-compose.jobs.yml --profile demo --profile fixture up --build -d --wait --wait-timeout 300
pnpm check
pnpm exec vitest run apps/api/tests/portfolio-management.test.ts apps/web/src/domain/PortfolioManagement.test.tsx
$env:FOLIO_JOB_FAULTS = '1'
pnpm exec vitest run apps/api/tests/jobs.test.ts
Remove-Item Env:FOLIO_JOB_FAULTS
$env:FOLIO_E2E_STACK = '1'
$env:FOLIO_E2E_DEMO = '1'
$env:FOLIO_E2E_FIXTURE = '1'
$env:FOLIO_E2E_JOBS = '1'
$env:FOLIO_E2E_EVIDENCE_DIR = '.local/priority-6/regression/auth'
$env:FOLIO_DOMAIN_EVIDENCE_DIR = '.local/priority-6/regression/domain'
$env:FOLIO_FIXTURE_EVIDENCE_DIR = '.local/priority-6/regression/fixture'
$env:FOLIO_DISCOVERY_EVIDENCE_DIR = '.local/priority-6/regression/discovery'
$env:FOLIO_PREVIEW_EVIDENCE_DIR = '.local/priority-6/regression/preview'
$env:FOLIO_ASSET_EVIDENCE_DIR = '.local/priority-6/regression/asset'
$env:FOLIO_JOBS_EVIDENCE_DIR = '.local/priority-6/regression/jobs'
$env:FOLIO_MANAGEMENT_EVIDENCE_DIR = '.local/priority-6/visual'
pnpm test:e2e
pnpm deps:verify
pnpm audit --json
node scripts/infrastructure-smoke.mjs
node scripts/auth-infrastructure-smoke.mjs
node scripts/domain-infrastructure-smoke.mjs
node scripts/local-fixture-smoke.mjs
docker build -f Dockerfile.release --target api-runtime -t folio-api-release:priority6 .
$env:FOLIO_RELEASE_IMAGE = 'folio-api-release:priority6'
node scripts/release-artifact-smoke.mjs
```

## Verified invariants and failure cases

- Bounded Unicode names, trimmed input, malformed/oversized/HTML/control/bidi/unknown-field rejection; persistent owned name, unchanged portfolio ID/base/FIFO/financial fields, same-name repeat without duplicate audit.
- Concurrent different-name updates have one winner and a safe stale409; rename does not expire an unchanged financial preview or rewrite old audits.
- Atomic concurrent matching delete requests share one receipt. Replaying an old receipt after replacement or secret rotation never deletes the new default; changed payload/key reuse409, unknown/deleted/unowned404.
- Actual controlled Mongo race orderings: delete holds the user guard before competing append, and append holds it before competing deletion. No orphan economics/projections, no unsafe populated deletion. Rename-versus-delete also has one safe winner.
- BUY/SELL/DIVIDEND/SPLIT, fully sold and voided originals stay undeletable/immutable. Projection/void/economic state alone blocks deletion even with inconsistent portfolio metadata.
- Auth/CSRF/no-store/strict queries/ownership/IDOR across all three operations, invalid versions/confirmation/UUID and public demo denial. No force input.
- JSON/CSV privacy export includes owned safe deletion metadata without hashes/keys. Account erasure separately removes receipts and populated history; a stale retry after erasure401 cannot recreate either.
- UI input/heading/cancel/notice focus, immediate scoped list update, financial-cache preservation on rename, deletion cache clearing, read failure/retry, stale unavailable-resource recovery and exact original UUID/body reuse after uncertain responses. Malformed/mis-scoped responses never claim success or expose schema details.

## Evidence boundary and verification findings

Protected reference checks cover **263 previously approved workflow PNGs plus one prior gallery preview**, foundation/tokens/shell/styles/account forms, financial screens except the new first-flow notice, engine/preview/receipt, canonical/provider/job code and original four Compose files. Connected Figma Settings54:50, DS2:4823/2:4815 contexts and returned screenshots were read; no write occurred.

Corrections found during verification: old OpenAPI path count updated for real management routes; controlled UI test errors use valid UUID envelopes and existing native assertions; explicit reauthentication after isolated fixture API signing-key regeneration; deletion comparison hash independent of development keys; safe schema/scope response handling; static blocked prose describes its disabled action rather than conflicting with real live success statuses. Existing financial/browser assertions remain unchanged. An infrastructure smoke attempt overlapped Docker container replacement and received502; the rerun after completed Compose health is the authority. Failed diagnostic logs stay ignored; final passing outputs are archived.

Secret-scan boundary stays unchanged: scan reviewable tracked/nonignored source/evidence and Git history with pinned Gitleaks8.30.1. Generated local runtime auth keys remain ignored/untracked in `.env`, never printed or archived; no new allow rule or suppression. Terminal evidence normalizes LF/trailing spaces only; raw logs stay ignored locally.

Remaining limits: no multi-portfolio/switching, ordinary populated deletion, provider activation/live entitlement, production operations, News/AI or final performance acceptance. User Priority6 review remains pending. Main remains unchanged; local coherent commit follows verified evidence, without merge/deployment.
