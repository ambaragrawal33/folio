# Isolated local writable fixture mode

L01 was explicitly approved on **2026-10-05**. This mode exercises real authentication, local MailHog, Mongo replica-set ledger transactions, Decimal projections and financial UI with **synthetic market inputs**. It is neither normal mode nor the read-only demo. It proves financial/workflow behavior, not live provider entitlement, coverage or observed prices.

## Start locally

```powershell
docker compose -f docker-compose.yml -f docker-compose.fixture.yml --profile fixture up --build -d fixture-api fixture-web
```

Open **http://127.0.0.1:5190**; MailHog is **http://127.0.0.1:8025**. Create a fresh account, follow its verification email, sign in and create the default INR/FIFO portfolio. Record transactions using the existing entry/review workflow. Do not use the read-only demo button. Fixture mode has no seeded account or seeded ledger: all account/financial writes are real and user-owned.

Stop just these services with the same Compose files/profile and `stop fixture-api fixture-web`. Do not use `down -v` or clear databases/caches. Account/ledger data persist in the existing local Mongo volume. Ephemeral local API signing secrets rotate on service recreation, requiring sign-in again; database records are preserved. This is not a production secret policy.

## Isolation and fail-closed configuration

| Boundary        | Required configuration                                                                                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit opt-in | `LOCAL_FIXTURE_MODE=true`; `NODE_ENV=development` or `test` only                                                                                                                                                                                                                                   |
| Mongo           | `mongodb://` local host `localhost`, `127.0.0.1` or Compose `mongo`; database **folio_local_fixture**. Test-only randomly named **folio_local_fixture_test\_<16 hex>** is allowed only with NODE_ENV=test. Actual auth connection must match that configured database before initializing models.  |
| Redis           | Local Redis, **database 1** (`/1`) and **folio:local-fixture** namespace. Normal/demo use their existing namespaces and cannot use reserved DB 1 or fixture database names. Logical DB isolation is within local Redis, not a claim of separate hardware.                                          |
| Browser/API     | Loopback-only published ports **5190/3020**. WEB_ORIGIN must be localhost/127.0.0.1; matching-Origin/CSRF rules remain. Host-process fixture API binds loopback; Docker-internal API is exposed only through loopback Compose publishing. Do not tunnel or publicly publish this mode.             |
| Cookies/auth    | **folio_fixture_refresh**, HttpOnly/SameSite=Strict; distinct from normal/demo **folio_refresh**, because cookies are not isolated by port. Fixture Compose uses independent generated signing/refresh secrets, with no normal `.env` inheritance. Bearer ownership/family/database checks remain. |
| Providers       | Demo mode, configured CoinGecko key or enabled Yahoo display entitlement cause fixture configuration rejection. Fixture gateway makes no provider network/cache calls. Live gateway rejects fixture mode. No silent fallback.                                                                      |
| Production      | Existing production startup gate stays intact. Fixture configuration fails on production, remote storage/origin, mixed namespaces or missing explicit opt-in.                                                                                                                                      |

For host-process development, configure these isolated values together; never toggle the flag while retaining normal/demo storage. Server settings are not VITE variables. Use a separate ignored environment file/session and separate API/Vite ports; never copy normal or production secrets into it.

## Explicit fixture matrix and hand-computed exercise

All prices below are synthetic strings. Current fixture FX is USD/INR **88** and INR/INR **1**, with source **local-fixture**, generated date/as-of. Historical USD/INR is **83 on 2026-01-05 only**. Other foreign trading dates return unavailable; explicit user overrides retain their own provenance and do not become provider observations. Same-currency historical FX remains mathematical identity 1. No historical backfill is fabricated.

| Instrument   | Current fixture            | State/reference                                                  |
| ------------ | -------------------------- | ---------------------------------------------------------------- |
| TCS:NSE      | INR 70; reference 68       | Generated now, fresh **fixture**, previous-close test convention |
| AAPL:US      | USD 110; reference 108     | Generated now, fresh **fixture**, previous-close test convention |
| VTI:US       | USD 14; reference 13       | Generated now, fresh **fixture**, previous-close test convention |
| BTC:CRYPTO   | USD 65000; reference 64000 | Generated now, fresh **fixture**, rolling-24h test convention    |
| ETH:CRYPTO   | USD 2600; reference 2550   | Deliberately **stale**, dated 2026-01-06T15:00:00Z               |
| RELIANCE:BSE | **No fixture price**       | Explicit missing quote; never zero                               |

Covered history consists of exactly two synthetic test points, dated 2026-01-05 and 2026-01-06, using the reference/current values above. Source, chart, caption and table labels distinguish them from observed market history. RELIANCE history is unavailable. The notice appears before signup and throughout authenticated product screens; verified session metadata preserves the notice if the mode-status request fails. “Fresh” means generated test input, not a claim of real market freshness.

Use **2026-01-05T15:00 UTC** / trading date **2026-01-05** for this exercise:

1. TCS BUY 10 × 100, fees 10; BUY 5 × 120, fees 5.
2. TCS SELL 12 × 150, fees 12: net 1788; FIFO cost consumed 1252; realized P&L **536**; remaining cost **363**.
3. TCS DIVIDEND gross 30, fees/withholding 2: income **28**, no units/cost change.
4. TCS SPLIT 2:1: **6** units, cost **363**, average native cost **60.5**; value **420**, unrealized **57**.
5. AAPL BUY 10 × 100, fees 0, automatic fixture historical FX 83: base cost **83000**, current FX 88, value **96800**, unrealized **13800**; price contribution **8300**, FX contribution **5500**. Local return **10%**, base return **16.626506…%**, FX return effect **6.63 percentage points** when displayed to two decimals.
6. Complete aggregate: value **97220**, remaining cost **83363**, unrealized **13857**, realized **536**, dividend **28**, current holdings movement **1772**. Cash is excluded.
7. Add ETH BUY 0.125 × 2400, fees 1: aggregate **125820**, cost **108346**, unrealized **17474**, complete but stale.
8. Add RELIANCE BUY 1 × 100, fees 0: partial coverage **3/4**, known-valued subtotal **125820**; total/aggregate unrealized/weights/allocation/concentration unavailable. Do not renormalize.
9. In another fresh fixture account, record only RELIANCE: coverage **0/1**, known-valued subtotal **0**, **total null**, not a zero portfolio valuation.

## Verification scope

Final measured results: **116 tests / 14 suites**, **95.54% overall lines**, all financial-core files **96.82–100% lines**, **11/11 full real-service E2E**. [Commands/output and 19-point proof map](PRIORITY_1_EVIDENCE.md); [14-state visual review](PRIORITY_1_VISUAL_REVIEW.md). This completes Priority 1 engineering, not all local P0 or live-provider verification. STOP for user review before Priority 2.

New tests cover configuration rejection, actual connection mismatch, no live-gateway use, generated/stale/missing/history/FX cases, account verification, four ledger types, hand-computed aggregates, ownership, unsupported-date rejection, cookie rotation/name isolation and OpenAPI. The explicit browser suite requires both normal/demo and fixture stacks, `FOLIO_E2E_STACK=1`, `FOLIO_E2E_DEMO=1`, `FOLIO_E2E_FIXTURE=1`:

```powershell
pnpm exec playwright test apps/web/e2e/local-fixture.spec.ts
```

Outputs default to ignored `.local/priority-1/visual`; use `FOLIO_FIXTURE_EVIDENCE_DIR` to choose a new review directory. Existing domain tests now accept `FOLIO_DOMAIN_EVIDENCE_DIR` so regression captures can be redirected without modifying approved Phase 3 evidence. Do not update approved baselines. No Priority 2–6 implementation, News, AI, hosting or deployment is included in L01.
