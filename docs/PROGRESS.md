# Folio progress

Updated **2026-10-04**. Phase 1 is complete at 18223b68caf90235b59fabbfb3924140580d79b6. The canonical GitHub cutover is complete, its Foundation checks run 37178104505 succeeded, and the user closed the full Phase 1 design review, including both mobile navigation states. **Phase 2 — Auth is COMPLETE on codex/phase-2-auth, committed and normally pushed. Implementation 13679261e550a92abd5f101a34212892da2b0963 plus verified CI/security refinements through e5bf543aeef4d48e0d7784421ee5f9aad5669c28 passed local gates and hosted run 37189352294 in both jobs. Main remains Phase 1. Phase 3 remains unauthorized.**

## Phase 1

Implemented: five-workspace pnpm monorepo; React/Vite/strict TypeScript frontend; Express infrastructure; shared strict schemas, independent release capability map and server-only OpenAPI export; generated Figma semantic tokens/state geometry, self-hosted fonts, shared primitives, gallery and shell; loopback-only Compose Mongo replica set/Redis/MailHog/API/web; environment validation, redacted logging/errors, request IDs, safe optional error-reporting hook, health/ready; lint/format/Husky; tests/coverage/browser accessibility; pinned CI/Dependabot and secret scanning.

Live Figma was refreshed read-only: 49 variables, eight styles, 26 families/119 variants, shell and full default/selected-state contexts. Export uses 40 canonical variables and keeps nine legacy variables as provenance. Native controls adapt the existing components; Light assets retain the exact downloaded paths with semantic mode color mapping.

Observed local evidence: 16 tests in four suites,99.50% line coverage (≥70% enforced), strict typecheck/lint/format/build passing; 416 packages/72 required peer edges without engine/peer failures; dependency audit clean; both-theme Chromium geometry/token/font/axe checks and keyboard/mobile flow pass; Mongo 8.2.12 writable rs0 primary, Redis 8.2.10, MailHog SMTP/inbox and same-origin proxy verified. Readiness degrades to 503 during a real Redis stop while liveness stays 200, then recovers.

Command output is collected in [Phase 1 evidence](PHASE_1_EVIDENCE.md) and evidence/phase-1. The final committed-code checkout (d0f1314) started with fresh Mongo/Redis volumes in156.58 seconds, with no host node_modules, shared dist or .env. Base/service images were already cached; dependencies were downloaded inside the build. This is a measured local result, not a cold-network guarantee. The earlier checkout also passed in157.94 seconds.

## Phase 2 implementation plan

1. Record approval provenance and inspect Auth 57:282, Settings 54:50 and existing DS controls through read-only MCP.
2. Implement strict shared auth/account contracts; users, hashed verification/reset/refresh tokens, refresh families and audit logs. Use Argon2id, memory-only 15-minute access JWTs, cookie refresh rotation with transaction-safe replay revocation, Redis limits and progressive account lockout.
3. Deliver verification/reset email through actual local MailHog; implement login/register/verify/resend/forgot/reset/expired-session flows and the P0 profile/privacy milestone. Extend missing screens from the source design; keep Google/TOTP/session management gated.
4. Verify expiry, single-use/races/replay, CSRF, two-user ownership, profile export/delete, OpenAPI, both-theme UI/accessibility, real email E2E, all quality/security gates and Compose. Commit and push the branch; do not merge or start Phase 3.

Production email O04 remains pending before public deployment; no production credentials are needed for local Phase 2. Financial engines and fixtures remain Phase 3+. Full portfolio defaults/onboarding wait for their real domain models.

## Limits and approval status

Canonical remote: https://github.com/ambaragrawal33/folio.git; default main. Hosted Phase 1 CI: https://github.com/ambaragrawal33/folio/actions/runs/37178104505. Phase 1 typography, tokens, shell, density, controls, tables, financial typography, Dark theme and accessibility substitutions are approved. Light and responsive/mobile are approved as derived implementations, not Figma-approved. Both 390×844 closed/open navigation states and inline/Escape/route-collapse/overflow/context behavior are finally approved. These decisions are closed; Figma is unchanged.

Later decisions remain pending: D03/D04/D11/D12, D10 write details, X02–X05/X07–X10, O02–O06, Watchlist model/API/implementation phase and other details outside explicit approvals. No production credentials requested.

## Phase milestones

| Phase                                   | Status                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------- |
| 0 Audit                                 | APPROVED by user 2026-10-04; retained dated [evidence](PHASE_0_EVIDENCE.md) |
| 1 Foundation                            | COMPLETE; hosted CI green; design review CLOSED / APPROVED                  |
| 2 Auth                                  | COMPLETE; committed/pushed branch; local gates and both hosted jobs green   |
| 3 Domain + first deploy                 | NOT STARTED                                                                 |
| 4 News                                  | NOT STARTED                                                                 |
| 5 AI / P0 complete deploy               | NOT STARTED                                                                 |
| 6 Analytics / P1                        | NOT STARTED                                                                 |
| 7 Goals/CSV/alerts/multiportfolio       | NOT STARTED                                                                 |
| 8 Sentiment/write-confirm/MF/metals/2FA | NOT STARTED                                                                 |
| 9 Release                               | NOT STARTED                                                                 |
| P2                                      | NOT AUTHORIZED                                                              |

Deliberately absent: ledger/models/seeds/transactions, financial engines/provider integrations, news, AI/chat/tools/streaming, Watchlist or other P1/P2 product features, production email, production secrets and public deployment.

## Phase 2 implemented and verified

Implemented P0 register/verify/resend/login/refresh rotation + replay-family revocation/logout/forgot/reset/change-password; strict shared contracts and 13 OpenAPI operations; Argon2id users, hashed single-use action/refresh tokens and durable audit logs; exact Origin/custom-header CSRF, Redis limits/progressive lockout; protected UI/session restoration; real MailHog verification/reset; persisted name/theme/number format/IANA timezone; JSON/CSV privacy export and password+DELETE cascade. Google, TOTP/session management and full portfolio settings remain gated. No production credential/provider/deployment configured.

Local evidence: 57 tests in six suites, 93.94% lines / 92.68% statements / 92.07% functions / 88.85% branches; all >=70% gates pass. Strict typecheck/lint/format/build/token checks pass. Six Chromium E2E tests pass in 48.8 seconds and verify actual MailHog links, sessions/preferences after reload, both exports, deletion, reset/change/logout, source geometry, both-theme axe and immutable Phase 1 gallery/shell/mobile captures. The final security regression covers IP/account limiter route aliases; actual Docker API/Redis also returns 429 after ten normalized-email attempts across aliases, and counters survive an API restart. Figma source contexts were read-only; approved foundation tokens/styles/captures remain unchanged. New auth/account states and all Light/mobile layouts are derived/provisional for review.

459 installed packages/73 peer edges passed verification, frozen install passed and security audit found no known vulnerabilities. Gitleaks trackable working files/history were clean. Compose API/web/Mongo/Redis healthy and MailHog running; real auth/OpenAPI/CSRF/Redis TTL/concurrency/index/email lookup smoke passed. [Phase 2 evidence](PHASE_2_EVIDENCE.md) contains actual commands/output, limitations and visual deviations. Financial-core tests are N/A, not claimed complete.

Remaining: production email O04, HTTPS/trusted-proxy/Safari deployment checks and Phase 2 visual approval; production startup stays gated. Later P0 domain/provider/AI work and all P1/P2 features stay unimplemented. Do not merge main or start Phase 3 without its authorization.
