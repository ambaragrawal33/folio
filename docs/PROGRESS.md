# Folio progress

Updated **2026-10-04**. Phase 0 was explicitly approved and Phase 1 — Foundation explicitly authorized. Foundation implementation, local gates and isolated clean-checkout verification are complete and committed on codex/phase-1-foundation. The formal hosted-CI gate remains UNVERIFIED because no remote was supplied; provisional design review remains pending. **Phase 2 has not started and requires separate authorization.**

## Phase 1

Implemented: five-workspace pnpm monorepo; React/Vite/strict TypeScript frontend; Express infrastructure; shared strict schemas, independent release capability map and server-only OpenAPI export; generated Figma semantic tokens/state geometry, self-hosted fonts, shared primitives, gallery and shell; loopback-only Compose Mongo replica set/Redis/MailHog/API/web; environment validation, redacted logging/errors, request IDs, safe optional error-reporting hook, health/ready; lint/format/Husky; tests/coverage/browser accessibility; pinned CI/Dependabot and secret scanning.

Live Figma was refreshed read-only: 49 variables, eight styles, 26 families/119 variants, shell and full default/selected-state contexts. Export uses 40 canonical variables and keeps nine legacy variables as provenance. Native controls adapt the existing components; Light assets retain the exact downloaded paths with semantic mode color mapping.

Observed local evidence: 16 tests in four suites,99.50% line coverage (≥70% enforced), strict typecheck/lint/format/build passing; 416 packages/72 required peer edges without engine/peer failures; dependency audit clean; both-theme Chromium geometry/token/font/axe checks and keyboard/mobile flow pass; Mongo 8.2.12 writable rs0 primary, Redis 8.2.10, MailHog SMTP/inbox and same-origin proxy verified. Readiness degrades to 503 during a real Redis stop while liveness stays 200, then recovers.

Command output is collected in [Phase 1 evidence](PHASE_1_EVIDENCE.md) and evidence/phase-1. The final committed-code checkout (d0f1314) started with fresh Mongo/Redis volumes in156.58 seconds, with no host node_modules, shared dist or .env. Base/service images were already cached; dependencies were downloaded inside the build. This is a measured local result, not a cold-network guarantee. The earlier checkout also passed in157.94 seconds.

## Limits and pending review

No Git remote or hosted Actions run exists; local equivalent checks are not labeled CI green. Derived Light shell, 1024/720 responsive breakpoints, unavailable copy, native semantics/accessibility substitutions and the own screenshot captures require design review. The captures are provisional evidence, not approved regression baselines. Figma was not changed.

Later decisions remain pending: D03/D04/D11/D12, D10 write details, X02–X05/X07–X10, O02–O06, Watchlist model/API/implementation phase and other details outside explicit approvals. No production credentials requested.

## Phase milestones

| Phase                                   | Status                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- |
| 0 Audit                                 | APPROVED by user 2026-10-04; retained dated [evidence](PHASE_0_EVIDENCE.md) |
| 1 Foundation                            | LOCAL VERIFIED / COMMITTED; hosted CI UNVERIFIED; design review pending     |
| 2 Auth                                  | NOT AUTHORIZED / NOT STARTED                                                |
| 3 Domain + first deploy                 | NOT STARTED                                                                 |
| 4 News                                  | NOT STARTED                                                                 |
| 5 AI / P0 complete deploy               | NOT STARTED                                                                 |
| 6 Analytics / P1                        | NOT STARTED                                                                 |
| 7 Goals/CSV/alerts/multiportfolio       | NOT STARTED                                                                 |
| 8 Sentiment/write-confirm/MF/metals/2FA | NOT STARTED                                                                 |
| 9 Release                               | NOT STARTED                                                                 |
| P2                                      | NOT AUTHORIZED                                                              |

Deliberately absent: auth/account/privacy flows, ledger/models/seeds/transactions, financial engines/provider integrations, news, AI/chat/tools/streaming, Watchlist or other P1/P2 product features, production email, production secrets and public deployment.
