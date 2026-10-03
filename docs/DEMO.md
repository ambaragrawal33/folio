# Demo and deployment plan

**Planning only, 2026-10-03. No live app, demo account or deployment exists. No smoke test has run.**

## Tiered walkthrough

After Phase 3: isolated demo entry → Dashboard current holdings/allocation/as-of → Holdings/detail → record a transaction → ledger/FIFO/FX update → stale/unavailable provider state → logout. Later panels show release-unavailable states, never Figma sample values.

After Phase 4: add attributed live or explicitly DEMO_MODE fixture headlines and source links. After Phase 5: ask a supported read-only question and inspect exact tool/source/as-of cards; injection or grounding failure yields a validated deterministic fallback.

Only after P1: add history/benchmark, goals/simulator, CSV preview/commit/undo, alerts and later MF/gold/manual assets. The final five-minute §17 walkthrough is login → Dashboard → add transaction → history/benchmark → assistant → news → alert. This final flow is not an honest Phase 3 demonstration; X09 records tiered demo activation.

Fixtures derive through the real ledger/valuation engine and dated transactions, not sample numbers transcribed from Figma. Tests run with upstream network disabled. Seed is idempotent, user isolation enforced, visible DEMO_MODE banner; production users cannot switch into another user's demo data.

## First deployment and every later phase

Manual deployment approval required. Planned frontend host /api same-origin proxy → API → Atlas/Redis; actual credentials/accounts/domain/email/scheduler are still pending O02–O06.

| Smoke step | Expected outcome | Actual status |
|---|---|---|
| /health and /ready | Liveness distinct from Mongo/cache readiness, cold-start recovery | NOT RUN |
| Register → verify → login → reset | Real selected email; expiring tokens; working auth | NOT RUN |
| Chrome refresh/logout | Secure httpOnly cookie; access token memory; rotation/persistence/revocation | NOT RUN |
| Real Safari refresh/logout | Same-origin cookie persistence (WebKit alone insufficient evidence) | NOT RUN |
| Ownership attempt with another user ID | Denied for all user resource APIs | NOT RUN |
| Record BUY/SELL/void/split/dividend | Correct decimal/FIFO/fees/FX, invalid oversell rejected | NOT RUN |
| Missing or failing providers | Cached stale with source/as-of or null unavailable; no invented totals | NOT RUN |
| DEMO_MODE with providers disabled | Deterministic domain numbers and clear isolation/banner | NOT RUN |
| News source failure | Other authorized feeds continue; headline/snippet/source link only | NOT RUN |
| SSE/AI (Phase 5) | Proxy keeps stream; tool progress + grounded final answer/fallback | NOT RUN |
| Both themes at 1440×1024 + responsive | Fidelity checklist, actual contrast, keyboard/focus/data-table chart alternative | NOT RUN |
| Scheduler/authenticated job repeat | HMAC protected, idempotent, quota-aware, durable job_run | NOT RUN |
| No secrets/log leakage | gitleaks and redaction checks; env never exposed to browser | NOT RUN |
| Backup/restore/export/delete | Documented permitted process and owned data cleanup | NOT RUN |

Capture host URLs, versions, deploy revision/time, browser/version and command results when run. Never substitute the Phase 0 probe responses for these integration checks.
