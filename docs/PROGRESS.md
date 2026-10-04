# Folio progress

Updated **2026-10-04**. **Phase 1/2 remain CLOSED / APPROVED. Phase 3 — Domain + first deploy is explicitly AUTHORIZED and OPEN.** Initial repository/specification/document/code inspection, read-only live Figma reinspection, provider probes and unchanged-foundation regression checks are complete on **codex/phase-3-domain**, based on Phase 2 closure **5ad2baa58c261781e94f8f13353185f6bd7fd7c6** (approved implementation **32ded912df0cac3407ee11f202d163e9686afa64**). Main stays **18223b68caf90235b59fabbfb3924140580d79b6**. **No Phase 3 application code yet; awaiting required financial/provider/demo decisions before affected implementation.** Light/mobile remain approved derived implementations, never Figma-approved. Figma, approved foundation and all accepted captures/baselines remain unchanged. Earlier phase authorization/review statements below are historical and superseded by the latest explicit authorization.

## Phase 3 entry inspection and required decision stop

Deployment constraint update: **O02 budget/shape confirmed by the user — ₹0/free-tier public demo, free provider-generated subdomains, free frontend + Express/API hosting, Atlas Free and compatible free Redis.** No domain or paid-service purchase/assumption. Vendor/account/proxy selection remains pending. Required security/persistence/financial/tests/mail/backup gates remain intact; report an evidenced free-tier blocker and STOP at the actual deployment boundary if required behavior cannot be met. Remaining financial/provider/demo choices are unchanged and pending; this clarification does not resume dependent implementation.

[Implementation plan](PHASE_3_PLAN.md) follows instrument master/search → Decimal ledger/projection → providers/FX/calendars → valuation/owned API → Dashboard/Holdings/Detail/Transactions/manual Onboarding/portfolio defaults → isolated real-domain demo → deploy configuration and actual gated publication → financial/security/UI verification. [Actual entry evidence](PHASE_3_EVIDENCE.md) records source hash, Git/remote state, six live MCP source contexts/screenshots, eight market/FX probes, registry candidate metadata and command output.

Actual unchanged entry gates: pnpm check passed58 tests/6 suites,93.94% overall lines (667/710),92.68% statements,92.07% functions,89.10% branches; lint/format/strict typecheck/build/token freshness passed. Real-service Chromium E2E6/6 passed in51.4s, including immutable Phase 1 captures and axe checks. Compose API/web/Mongo/Redis healthy; MailHog running; Mongo8.2.12 writable rs0 primary; Redis concurrency/TTL, actual auth CSRF/ownership/OpenAPI and SMTP/proxy smokes passed.459 packages/73 peer edges/no failures; audit no known vulnerabilities. **Financial core absent:90% gate NOT MEASURED, not passed.** No new domain/API/IDOR fixture is claimed.

X02–X05, Phase3 portions of X07–X09, O03 provider/use/coverage and O06 demo isolation remain **PENDING**. Concrete proposals and alternatives are reviewable in the plan; none is silently approved. Financial accounting/valuation rules materially block the initial engine, so STOP for those specific choices after independent inspection/verification. O02hosting/O04production mail/O06scheduler+backups remain separate live-deployment gates and need not block subsequent independently authorized domain implementation. No public deployment/credentials/dependency install/Phase 4 work.

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

| Phase                                   | Status                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 0 Audit                                 | APPROVED by user 2026-10-04; retained dated [evidence](PHASE_0_EVIDENCE.md)                      |
| 1 Foundation                            | COMPLETE; hosted CI green; design review CLOSED / APPROVED                                       |
| 2 Auth                                  | CLOSED / APPROVED — engineering and corrected visual review; Light/mobile approved as derived    |
| 3 Domain + first deploy                 | AUTHORIZED / OPEN — inspection and plan complete; required decisions pending; no domain code yet |
| 4 News                                  | NOT STARTED                                                                                      |
| 5 AI / P0 complete deploy               | NOT STARTED                                                                                      |
| 6 Analytics / P1                        | NOT STARTED                                                                                      |
| 7 Goals/CSV/alerts/multiportfolio       | NOT STARTED                                                                                      |
| 8 Sentiment/write-confirm/MF/metals/2FA | NOT STARTED                                                                                      |
| 9 Release                               | NOT STARTED                                                                                      |
| P2                                      | NOT AUTHORIZED                                                                                   |

Deliberately absent: ledger/models/seeds/transactions, financial engines/provider integrations, news, AI/chat/tools/streaming, Watchlist or other P1/P2 product features, production email, production secrets and public deployment.

## Phase 2 implemented and verified

Implemented P0 register/verify/resend/login/refresh rotation + replay-family revocation/logout/forgot/reset/change-password; strict shared contracts and 13 OpenAPI operations; Argon2id users, hashed single-use action/refresh tokens and durable audit logs; exact Origin/custom-header CSRF, Redis limits/progressive lockout; protected UI/session restoration; real MailHog verification/reset; persisted name/theme/number format/IANA timezone; JSON/CSV privacy export and password+DELETE cascade. Google, TOTP/session management and full portfolio settings remain gated. No production credential/provider/deployment configured.

Local evidence: 57 tests in six suites, 93.94% lines / 92.68% statements / 92.07% functions / 88.85% branches; all >=70% gates pass. Strict typecheck/lint/format/build/token checks pass. Six Chromium E2E tests pass in 48.8 seconds and verify actual MailHog links, sessions/preferences after reload, both exports, deletion, reset/change/logout, source geometry, both-theme axe and immutable Phase 1 gallery/shell/mobile captures. The final security regression covers IP/account limiter route aliases; actual Docker API/Redis also returns 429 after ten normalized-email attempts across aliases, and counters survive an API restart. Figma source contexts were read-only; approved foundation tokens/styles/captures remain unchanged. New auth/account states and all Light/mobile layouts are derived/provisional for review.

459 installed packages/73 peer edges passed verification, frozen install passed and security audit found no known vulnerabilities. Gitleaks trackable working files/history were clean. Compose API/web/Mongo/Redis healthy and MailHog running; real auth/OpenAPI/CSRF/Redis TTL/concurrency/index/email lookup smoke passed. [Phase 2 evidence](PHASE_2_EVIDENCE.md) contains actual commands/output, limitations and visual deviations. Financial-core tests are N/A, not claimed complete.

Remaining future deployment gates: production email O04 and HTTPS/trusted-proxy/Safari checks; production startup stays gated. Phase 2 visual approval is closed as recorded below. Later P0 domain/provider/AI work and all P1/P2 features stay unimplemented. Do not merge main or start Phase 3 without its authorization.

## Phase 2 visual corrections — 2026-10-04

User's first visual review was NOT approved. Implemented only its requested corrections: Settings-only source type/geometry and avatar border, readable mobile profile grid with Edit below identity, single section separators, human-readable deletion validation, intrinsic-width one-line permanent deletion action, and the existing DS Disabled variant during auth submission. No shared Phase 1 primitive/style/token/responsive rule or approved capture changed; Figma remains read-only. Dark/Light desktop and derived mobile captures are in [visual correction evidence](PHASE_2_VISUAL_CORRECTIONS.md).

Actual final local gates: `pnpm check` passed lint/format/token freshness/strict typecheck, **58 tests in six suites**, coverage **93.94% lines / 92.68% statements / 92.07% functions / 89.10% branches**, and all builds. All **six E2E tests** passed, including unchanged Phase 1 screenshot baselines. Targeted real-service review produced six exact-viewport default captures and **12 axe audits with zero violations**, verified source geometry, deletion copy/one-line action in three requested modes, readable 220px mobile identity/229px profile, zero horizontal overflow/independent scrolling, keyboard/focus and closed/open/Escape/route-collapse navigation. Disposable review account was removed. Dependency verification passed 459 packages/73 peer edges; audit found no known vulnerabilities; trackable files/history secret scans passed.

Intentional remaining Figma differences and their reasons are recorded in DESIGN_HANDOFF.md and accepted by the user's final closure. Passing engineering/axe/overflow tests alone was not visual approval; the separate explicit user approval below closes that gate. Phase 1 design review remains CLOSED. Phase 3 remains NOT STARTED and requires separate authorization.

## Phase 2 final user approval and closure — 2026-10-04

The user explicitly approved the P0 authentication/account implementation, security/ownership boundaries, refresh rotation/replay revocation, CSRF/Redis throttling, profile/preferences, privacy export/delete, Auth/Settings, Dark Login/Settings, derived Light Login/Settings and derived Light mobile Registration/Settings. Closed/open mobile navigation, accessibility substitutions, pending/loading, validation and destructive treatment are approved. The mobile profile-header blocker is resolved; corrected geometry and documented intentional deviations are accepted.

Accepted implementation state: **codex/phase-2-auth**, **32ded912df0cac3407ee11f202d163e9686afa64**, clean working tree, synchronized origin, main unchanged, no merge/force-push. This closure changes documentation only; it does not change application code, Figma, Phase 1 decisions/captures or any screenshot baseline. Light/mobile approval remains approval of derived implementations because dedicated product reference frames do not exist. Phase 2 is fully CLOSED / APPROVED. STOP; await separate explicit Phase 3 authorization.
