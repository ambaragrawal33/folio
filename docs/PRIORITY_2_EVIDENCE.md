# Priority 2 — canonical instrument discovery evidence

**2026-10-05.** Only Priority 2 implemented on **codex/phase-3-domain**; inspected clean starting HEAD **1a6f23adb2d718461be9448b4cea7ad7f00c5d7e**. User has CLOSED / APPROVED Priority 1/L01 engineering and visual review. Priority 2 visual approval is pending. No Priority3+, News/AI, hosting/spending/deployment, Figma write, main merge, new dependency or financial-engine rewrite.

## Implementation and exact supported universe

Added strict canonical registry validation, seven dated verified identities, optional verified aliases, authenticated bounded discovery contract/API and separate capability-aware provider candidate boundary. New explicit-search/native-selector workflow retains canonical identity across no-results/outage and displays exchange/currency/name/source/provider alias. Typing cannot become a transaction ID. Existing `/instruments`, owned global search, ledger, demo and fixture behavior stay compatible. Original six identities and pre-existing live quote/history scope are preserved separately.

**INR equities:** TCS:NSE, RELIANCE:BSE, INFY:NSE, INFY:BSE, TCS:BSE. **USD equities:** AAPL:US, MSFT:US. **USD ETFs:** VTI:US, SCHB:US, VOO:US. **USD-quoted crypto:** BTC:CRYPTO, ETH:CRYPTO, SOL:CRYPTO. Exactly **13**, all sectors **Unknown**. US is the existing canonical bucket; no account/listing-venue model added. Original VTI name/provider mapping remains unchanged. [Full identity/alias/source table](PROVIDER_AUDIT.md), [actual identity probes](evidence/priority-2/2026-10-05/identity-probes.json).

Search: NFKC/case/whitespace normalization; multi-token name/symbol/canonical-ID/provider-alias matching; exact canonical > exact alias > exact symbol > exact name > symbol prefix > substring, with deterministic ASCII symbol/ID ties. Empty search browses the bounded catalogue. **Default20, accepted1–30**, explicit truncation, max100 query characters, strict unknown/control-character rejection. INFY/TCS collisions return separate NSE/BSE choices; no guessing. Extra verified BSE alias532540 resolves only TCS:BSE; provider-qualified aliases such as yahoo:INFY.NS are supported. New quote/history coverage is not inferred from search.

Discovery adapters require all search/entitlement/coverage/credential gates; max5 adapters, max30 candidates,3-second response wait, fail-closed malformed/conflicting/unknown identities, fallback only to permitted candidates. Provider candidates never create or change canonical identities. **Runtime Yahoo/CoinGecko search remains disabled.** Test-only permitted/failing adapters prove the boundary, not vendor activation. Keyless identity probes returned HTTP200 for six Yahoo identities and CoinGecko Solana identity, corroborated by issuer/project facts; no price/history values retained or used. No keyed CoinGecko smoke/market entitlement claimed. An explicit pre-existing six-record market list prevents the new seven identities from causing quote/history transport calls even with older provider test configuration enabled.

## Measured verification

Evidence is actual command output. Logs normalize terminal trailing padding/line endings only. Final lint/format and secret scans follow document formatting; no application change follows the final full check.

| Gate                          | Actual result / evidence                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                  | **PASS** lint, Prettier, strict TypeScript, token freshness, coverage, shared/API/web builds; **126 tests /16 suites**. [Output](evidence/priority-2/2026-10-05/check.txt)                                                                                                                                                                                                                        |
| Overall coverage              | **95.61% lines,1941/2030;94.67% statements;92.26% functions;89.59% branches**; all >=70%. [Measured JSON](evidence/priority-2/2026-10-05/coverage-summary.json)                                                                                                                                                                                                                                   |
| Per-file financial-core >=90% | adapters **96.82% (122/126)**; discovery **98.30% (58/59)**; exact parser **100% (14/14)**; local fixture **100% (20/20)**; Decimal **100% (26/26)**; ledger **100% (108/108)**; valuation **100% (62/62)**; formatter **100% (28/28)**. Discovery added to the gate, not excluded                                                                                                                |
| Real-service Chromium E2E     | **12/12 PASS,3.8 minutes**. Fresh registration/MailHog verification/login/portfolio/search/selection/ledger/valuation; existing auth/privacy/financial/normal/demo/fixture regressions and unchanged foundation screenshot gates. [Output](evidence/priority-2/2026-10-05/e2e.txt)                                                                                                                |
| Focused visual/browser review | **14 states /28 PNGs**, Dark/derived Light desktop1440×1024, mobile390×844, tablet768×1024; **zero axe WCAG2A/AA/2.1AA, horizontal overflow and independent scroll**. Pending delays the real catalogue response; error uses explicitly injected browser503 with actual retry. [Review](PRIORITY_2_VISUAL_REVIEW.md), [machine checks](evidence/priority-2/2026-10-05/visual/browser-checks.json) |
| Existing regression states    | Auth/privacy/FIFO/FX/P&L/void/stale/partial/missing, normal/demo/fixture isolation, keyboard/mobile navigation and both-theme foundation PASS. [Domain checks](evidence/priority-2/2026-10-05/domain-regression-browser-checks.json), [fixture checks](evidence/priority-2/2026-10-05/fixture-regression-browser-checks.json)                                                                     |
| Mongo/domain/OpenAPI/demo     | Writable rs0 primary, multi-document commit/abort, exact34-digit Decimal128; **28 v1 operations /24 paths**, private/no-store APIs; public demo unchanged5 positions/9 economics and hand totals215316/186205.4/29110.6, writes403. [Output](evidence/priority-2/2026-10-05/domain-smoke.txt)                                                                                                     |
| Auth/Redis/MailHog/health     | Redis20 concurrent increments/TTL, CSRF403/private401/no-store/auth indexes; readiness/proxy/docs200, MailHog SMTP/API PASS. [Auth](evidence/priority-2/2026-10-05/auth-smoke.txt), [infrastructure](evidence/priority-2/2026-10-05/infrastructure-smoke.txt)                                                                                                                                     |
| Fixture fail closed           | DB1 fixture probe absent from DB0;3 authoritative mode flags; six actual API startup rejections before infrastructure initialization. [Output](evidence/priority-2/2026-10-05/fixture-smoke.txt)                                                                                                                                                                                                  |
| Local Compose                 | Nine running /eight configured healthchecks healthy; MailHog separately probed; loopback ports. Rebuilt without resetting volumes; final demo source synchronized and API source hashes match. [Build](evidence/priority-2/2026-10-05/compose-build.txt), [state](evidence/priority-2/2026-10-05/compose-health.txt), [hashes](evidence/priority-2/2026-10-05/demo-runtime-source-hashes.txt)     |
| Dependencies/security         | No manifest/lockfile/new dependency. **490 packages /82 peer edges /failures[]**, Node24.19/pnpm11.19/TS6.0.3; audit **no known vulnerabilities**. [Graph](evidence/priority-2/2026-10-05/dependencies.txt), [audit](evidence/priority-2/2026-10-05/audit.txt)                                                                                                                                    |
| Secrets                       | Pinned Gitleaks scans trackable working files +full Git history, redacted. [Final output](evidence/priority-2/2026-10-05/secret-scan.txt)                                                                                                                                                                                                                                                         |
| Source/baselines              | **113 approved PNGs** match Git blobs exactly; protected foundation/token/auth/capture/engine/formatter/package/lockfile/Compose paths have zero diff against starting HEAD. Figma read-only. [Hashes](evidence/priority-2/2026-10-05/baseline-preservation.json), [Figma](evidence/priority-2/2026-10-05/figma-source-check.json)                                                                |

## Focused test and security proofs

`apps/api/tests/discovery.test.ts`: exact symbol/name/partial/case/whitespace/provider-qualified alias/canonical-ID/BSE code; separate exchange collisions; reversed-input stable sorting/limits/truncation; currencies/Unknown sector; identical duplicate dedup and canonical/provider-alias conflicts; invalid identity/currency/class; every unavailable capability/entitlement/coverage/credential gate; strict length/control/limit/unknown input; malformed/oversized/conflicting/unknown provider responses; unavailable provider, permitted-only fallback and timeout.

`apps/api/tests/local-fixture.test.ts`: authenticated search, unauth401/no-store, query injection400, shared instrument-route bucket429; fresh owner selects INFY:NSE and appends BUY2×100+fee1; real holding **quantity2/cost201**, quote null, total null. Valid request IDs with raw INFY.NS/INFY/UNKNOWN:NSE reject404 and book nothing; foreign owner404/books nothing. Existing isolation/financial fixtures pass. `providers.test.ts` proves new seven quote/history identities cause **zero transport calls** and remain unavailable.

`InstrumentPicker.test.tsx`: no per-keystroke request/automatic selection; Enter search, ArrowDown focus, selection pinning/no results; failure/retry and malformed-contract recovery. Existing transaction tests retain foreign FX/dividend/split compatibility.

`apps/web/e2e/discovery.spec.ts`: fresh real account journey,13 identities then2 separate INFY exchange options; ArrowDown focuses native select, two further arrow keys explicitly choose NSE; alias search/no-result preservation; pending DS Disabled state; injected outage/retry; themes/mobile/tablet; Escape/aria-expanded; owned real ledger/holdings with unavailable quote rather than invented fixtures. [Owned local financial results](evidence/priority-2/2026-10-05/visual/financial-results.json) contain no tokens/secrets.

Early failures fixed/rerun: invalid test request-ID syntax; ambiguous picker region label; a test catalogue missing AAPL; wrong test ledger URL. Docker rebuild contention caused one timed-out run; rerun after rebuild passed with unchanged timeouts. No failing test, gate or threshold removed/weakened.

## Reproduce and stop boundary

```powershell
docker compose -f docker-compose.yml -f docker-compose.demo.yml -f docker-compose.fixture.yml --profile demo --profile fixture up --build -d --wait
$env:FOLIO_TEST_MONGODB_URI='mongodb://127.0.0.1:27017/?directConnection=true&replicaSet=rs0'
$env:FOLIO_TEST_REDIS_URL='redis://127.0.0.1:6379'
pnpm check
$env:FOLIO_E2E_STACK='1'
$env:FOLIO_E2E_DEMO='1'
$env:FOLIO_E2E_FIXTURE='1'
$env:FOLIO_E2E_EVIDENCE_DIR='.local/priority-2/regression/auth'
$env:FOLIO_DOMAIN_EVIDENCE_DIR='.local/priority-2/regression/domain'
$env:FOLIO_FIXTURE_EVIDENCE_DIR='.local/priority-2/regression/fixture'
$env:FOLIO_DISCOVERY_EVIDENCE_DIR='.local/priority-2/visual'
pnpm test:e2e
node scripts/domain-infrastructure-smoke.mjs
node scripts/infrastructure-smoke.mjs
node scripts/auth-infrastructure-smoke.mjs
node scripts/local-fixture-smoke.mjs
pnpm deps:verify
pnpm audit --audit-level=moderate
node scripts/scan-secrets.mjs
```

No snapshot updates; outputs use new paths. Only curated13 supported: no internet identity auto-creation, raw-symbol bypass, broad unsupported coverage, guessed sectors or fixture-based identity verification. Live discovery/market entitlement/keyed smoke remain separate. New identities do not get prices/history automatically. Registry read capacity1000 and parent catalogue30 are bounded; a future verified universe above30 needs a selected-ID fetch/expanded picker contract before shipping, not silent expansion.

JS build warning **559.45 kB minified /168.55 kB gzip**, up from556.24, remains unsuppressed. No server-authoritative preview, lots/activity UI, jobs/refresh, portfolio CRUD or500-record final acceptance claim. L02 remains approved/unimplemented. Priority3–6 await their gate; News/AI stay separate. No hosting/purchase/deployment/main merge/push. Commit/clean-tree results are reported after recording. **STOP for Priority2 review.**
