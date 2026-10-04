# Provider and dependency audit

## Phase 3 entry reinspection — 2026-10-04

User deployment constraint: **₹0/free-tier public demo only**, provider-generated subdomains, free frontend/Express API, Atlas Free and compatible free Redis. No custom domain or paid service assumed/purchased. This is confirmed O02 budget/shape, not selection or current entitlement verification of a specific frontend/API/Redis provider. Recheck actual selected service quotas, protocol/persistence/proxy/cookie/email/backup capabilities at deployment time; do not weaken existing requirements to fit a plan. An evidenced incompatibility blocks actual publication and must be reported. Historical paid alternatives below are audit context, not authorized initial deployment options.

Phase3 explicitly authorized; provider selection/coverage/rights and operational O02–O06 approvals are not implied. [Actual bounded no-key probes and exact package metadata](evidence/phase-3/provider-inspection.json), [raw command output](evidence/phase-3/provider-command.txt) and [Phase3 evidence](PHASE_3_EVIDENCE.md) distinguish observations from implementation. No account/key inspected, dependency installed or application integration written.

Frankfurter ECB latest200 gives2026-10-02 USD/INR96.32; Saturday2024-01-06 returnsJan5/83.15; a Jan1–7 range includesDec29 boundary data. Require actual returned date/provenance and the pending X05 on/before policy; never claim daily references are intraday FX. Yahoo TCS.NS and RELIANCE.BO200 establish observed market/currency only. AAPL2020 split probe returns4:1 with separate close/adjclose; close is split-adjusted, not automatically as-traded history. CoinGecko actual keyless current price200 has timestamp/24h; older Jan2024 history401/error10012 explicitly limits public history to365 days. Demo-key/entitled fallback smoke remains NOT RUN.

Fresh [CoinGecko Demo price documentation](https://docs.coingecko.com/demo/reference/simple-price) establishes canonical-ID batching up to515, timestamp/24h freshness fields; [limits](https://docs.coingecko.com/docs/errors-and-rate-limits) distinguishes Demo100/min/keyless shared IP and error requests counting against minute limits. [Pricing](https://www.coingecko.com/en/api/pricing) still lists10k monthly Demo/one-year history/attribution and separate commercial licenses. [Frankfurter](https://frankfurter.dev/) documents provider filtering/daily data/abuse limiting. [Twelve Data Basic](https://twelvedata.com/pricing) is internal non-display8/min/800/day; no public-display or all-P0-market entitlement verified. Yahoo terms retrieval failed, including429; do not treat reachability or wrapper MIT license as market redistribution rights.

Current maintainer [Yahoo fetch source](https://raw.githubusercontent.com/gadicc/yahoo-finance2/dev/src/lib/yahooFinanceFetch.ts) JSON-parses raw text, so the integration must capture bounded raw financial tokens through its transport before Decimal conversion; exact pinned-release hook verification remains required. Registry exact decimal.js10.6.0/lossless-json4.3.1/fast-check4.10.2/yahoo-finance2 4.0.2 metadata all200; candidate engine/license details retained. Existing459-package/73-peer graph and current advisory audit pass, but no new graph is resolved or installed. Proposed choices remain in [Phase3 plan](PHASE_3_PLAN.md) pending actual authorization. Hosting/mail/backup/calendar exceptional-session/public browser smoke is unverified; no public deployment claimed.

Checked **2026-10-03** through current primary documentation, npm registry metadata and read-only live HTTP probes. No provider account was created, paid plan selected, key read, dependency installed or integration code written. Results are dated observations; recheck at the phase that uses each provider. Follow-up 2026-10-04: Docker/Compose and WSL2 daemon now verified, superseding the original missing-Docker observation below; O01 approved in principle, other provider/hosting decisions remain pending. See [actual Docker evidence](evidence/docker-verification-2026-10-04.json).

## Actual endpoint probes

### Phase 2 verification — 2026-10-04

Phase 0 statements below are historical observations. Phase 2 installs only its auth dependencies: argon2 0.45.1, jose 6.2.12, nodemailer 10.0.14, @types/nodemailer 8.0.2 and mongodb-memory-server 11.3.0. Exact official registry engine/peer/repository metadata was checked before resolution; native Argon2 executes on Windows and in Docker. Node24.19.0/pnpm11.19.0/TS6.0.3 remain pinned. Full installed graph verification reports 459 packages and 73 peer edges with zero failures; pnpm security audit reports no known vulnerabilities. Final frozen install and scan evidence is in [Phase 2 evidence](PHASE_2_EVIDENCE.md).

Local nodemailer delivers actual verification/reset messages to MailHog; E2E retrieves the real inbox links and completes both flows. MongoDB 8.2.12 runs actual transaction/rotation/replay/ownership tests; an isolated test binary is explicitly prepared before bounded test hooks. Redis atomic limits are exercised across two independent clients with TTL, and the running API rejects missing CSRF/origin and unverified bearer identity. MailHog remains loopback-only development infrastructure. O04 production sender/provider stays pending, and no external email account/key was requested. Market/news/AI/provider integrations and other O02–O06 choices remain deferred, not approved by this auth work.

[provider-probes.json](evidence/provider-probes.json) records twelve successful HTTP 200 responses with content type/size, small diagnostic samples and RSS item counts. [supplemental-probes.json](evidence/supplemental-probes.json) and [bse-probes.json](evidence/bse-probes.json) record stock/benchmark/search follow-ups. Sandbox DNS was blocked; approved read-only network requests were rerun outside it. An HTTP 200 proves reachability/returned shape today, not integration correctness, SLA or redistribution permission.

| Provider / request | Executed result | Limit of verification |
|---|---|---|
| Frankfurter v2 USD→INR, providers=ecb | 200, date 2026-10-02, rate 96.32 | Daily reference, no intraday quote. Current observation, not hardcoded app data. |
| Frankfurter historical 2024-01-02 | 200, USD→INR 83.32 | Need holiday lookup and user override fixtures in Phase 3. |
| CoinGecko /api/v3/ping | 200 keyless | Authenticated Demo quotes/history not tested: no key supplied. |
| Yahoo chart TCS.NS / AAPL, 1d/5d | Both 200, INR / USD | Wrapper not installed or executed; history/split semantics not yet verified. |
| Yahoo numeric 500325.BO | 404 | Scrip number is not a verified Yahoo ticker. Do not construct IDs by suffixing arbitrary inputs. |
| Yahoo Reliance search + RELIANCE.BO chart | Both 200; search returned RELIANCE.BO, BSE quote INR | BSE connectivity established using observed provider symbol; stock coverage is not exhaustive. |
| Yahoo ^NSEI / ^GSPC | Both 200, INR / USD | Benchmarks reachable, not computed/FX-normalized/TWR-validated. |
| Yahoo TCS search | 200; TCS.NS, TCS.TO, TCS.DE | Canonical identity must distinguish exchange/currency. Sector metadata not validated. |
| Yahoo RSS | 200, 49 item tags | XML count only, not full RSS parser, freshness or rights validation. |
| MarketWatch RSS | 200, 10 item tags | Same limitation. |
| Investing.com RSS | 200, 10 item tags | Same limitation; restrictive content terms require review. |
| WSJ Markets RSS | 200, 20 item tags | Same limitation; attributed snippets do not bypass rights. |
| Bloomberg Markets RSS | 200, 20 item tags | Same limitation. |
| AMFI NAVAll.txt | 200, ~1.52 MB text | Header includes Plan/Option; do not assume a legacy six-column parser. |
| mfapi.in scheme 119551 | 200, ~133 KB JSON | Third-party service; no SLA/redistribution entitlement verified. |

Exact probe commands are in [PHASE_0_EVIDENCE.md](PHASE_0_EVIDENCE.md); no complete article bodies are saved.

## Provider findings and proposed choices

| Topic | Current primary source finding | Proposed default / unresolved requirement |
|---|---|---|
| Crypto | [CoinGecko pricing](https://www.coingecko.com/en/api/pricing) lists Demo 10,000 monthly calls, 100/min and attribution; Demo historical access is limited to one year. [Authentication](https://docs.coingecko.com/demo/reference/authentication) uses api.coingecko.com/api/v3 and x-cg-demo-api-key. | Demo key + global batch cache, last-updated timestamps, configurable budget. Keyless ping is not authenticated integration verification. Demo commercial rights must not be assumed; older ledger history needs explicit coverage strategy. |
| Stocks | [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) is a maintained unofficial wrapper; registry 4.0.2 requires Node ≥22. | Provider interface/capabilities/circuit breaker, verified symbols, per-market calendars and raw-vs-adjusted history fixture before Phase 3. Unofficial Yahoo can fail; commercial use needs appropriate licensed data. |
| Optional fallback | [Twelve Data pricing](https://twelvedata.com/pricing) Basic: 8 credits/min, 800/day, internal non-display usage and limited markets; global coverage is plan-dependent. [Finnhub pricing](https://finnhub.io/pricing) did not expose usable current entitlement detail in this audit. | Twelve Data candidate only after display entitlement and NSE/BSE/global symbols are confirmed with the user's plan/key. Finnhub limits/free coverage **unverified**, not silently assumed. No free fallback proved to cover every P0 market. |
| FX | [Frankfurter documentation](https://frankfurter.dev/) exposes v2 current/historical daily rates without key or fixed usage quota (abuse limits still apply); supports provider filtering. [APILayer ExchangeRate](https://docs.apilayer.com/Exchangerate/docs/api-documentation) requires access_key. | Frankfurter v2 with providers=ecb for reproducibility; explicitly label daily reference/as-of, never call it realtime. Historical rate = latest available on/before date, subject to policy approval and test. Keyed exchangerate.host not the no-key default. |
| Indian mutual funds | [AMFI NAV download](https://www.amfiindia.com/net-asset-value/nav-download) provides published NAV and historical downloads limited to 90-day chunks. | AMFI first candidate in Phase 8, daily NAV and versioned parser/history chunks; mfapi optional fallback with limits/terms still unverified. |
| Metals/manual | Stock provider spot/futures coverage, contracts/units and commercial terms not established by the probes. | P1 manual price candidate until symbol/INR-per-gram or other unit, FX and futures roll methodology are approved. No futures price presented as physical gold without explanation. |
| NewsAPI | [NewsAPI pricing](https://newsapi.org/pricing) Developer: 100 requests/day and 24h delay, development only; [terms](https://newsapi.org/terms) restrict free use to development. | Do not use Developer in staging/public production. RSS metadata or a paid entitled plan; no hidden NewsAPI dependency in P0. |
| RSS | All five specified feeds responded. [Investing RSS index](https://www.investing.com/webmaster-tools/rss) publishes feeds, while [content terms](https://www.investing.com/about-us/terms-and-conditions) restrict content use without permission. [Bloomberg terms](https://www.bloomberg.com/notices/tos/) require separate rights review. Yahoo/Dow Jones current terms pages were inaccessible during parts of the audit. | Store permitted headline/snippet/source/url/publishedAt/tags only, source links and attribution. Feed availability is not a license. Decide intended use and permitted publishers before Phase 4; inaccessible rights remain unresolved. |
| Calendars | [NSE holidays](https://www.nseindia.com/resources/exchange-communication-holidays), [NYSE hours/calendars](https://www.nyse.com/trade/hours-calendars), [Nasdaq calendar](https://nasdaqtrader.com/Trader.aspx?id=Calendar) provide authoritative market schedules. Full BSE holiday/special-session data not verified here. | Versioned updatable exchange-calendar data including exceptional sessions; crypto 24/7. Calendar implementation remains Phase 3; a Saturday “Market Open” Figma sample cannot set runtime market state. |

### Budget calculation (derived, not provider claims)

One crypto global batch every five minutes, all day, for a 31-day month: 12×24×31 = **8,928 calls**, leaving **1,072** of a 10,000-call quota for search/history/retries. Two batches per tick need 17,856 calls and are infeasible on that quota. Batch cap is endpoint-specific and not verified here. Cadence must slow/idle when no active users or reserve is exhausted; cap/retry accounting and monthly reset must be tested. Per-user polling is not a valid upstream budget.

US regular session 6.5h gives 78 five-minute intervals/day; ten unbatched Twelve Data symbols consume 780 daily credits before metadata/retries, eleven consume 858 and exceed 800. Multi-symbol HTTP requests need not reduce per-symbol credits. NSE regular 6.25h gives 75 intervals. These arithmetic budgets exclude special sessions and do not promise market-wide coverage on free plans.

Frankfurter daily reference does not implement intraday “live FX.” Free crypto history does not necessarily backfill arbitrary past ledger dates. Missing prices/history must remain explicitly unavailable, never generated outside isolated DEMO_MODE fixtures.

## Hosting, storage and job feasibility

| Service | Current primary documentation | Consequence |
|---|---|---|
| Render | [Free services](https://render.com/docs/free): idle free web service spins down after 15 minutes, can take about a minute to restart; ephemeral filesystem. | Stateless API, external persistence/jobs, visible waking state. Uptime pings do not promise free always-on availability. No in-process node-cron reliance. |
| Railway | [Plans](https://docs.railway.com/pricing/plans): Free limited credits; Hobby $5 minimum and usage metering. | Alternative if user accepts budget; not unlimited free compute. |
| Atlas | [Free/shared limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations): free MongoDB 8.0, 0.5GB including indexes, 100 ops/sec, 500 connections, no managed backups; inactive free clusters can pause. | Index/storage budget, documented backup/restore strategy and tiny demo dataset. Local replica set needed for transactional correctness; cannot equate free cluster with resilient commercial production. |
| Upstash | [Redis pricing](https://upstash.com/pricing/redis): free 256MB / 500K commands monthly. [BullMQ integration](https://upstash.com/docs/redis/integrations/bullmq) warns about idle polling traffic and recommends fixed pricing. | Redis required for deployed rate limits despite §14 env matrix calling it optional. Local BullMQ fine; avoid perpetual quota-limited cloud workers. Jobs via idempotent authenticated HTTP/CLI with external scheduler proposed. |
| GitHub Actions | [Scheduled events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): minimum five-minute interval, default-branch execution, possible delays/dropped runs; inactive public repository schedules may disable. | No exact five-minute quote freshness SLA. Requires future remote/CI secrets, not present in this local-only repository. |
| Vercel | [Hobby terms](https://vercel.com/docs/plans/hobby): personal non-commercial use. | Academic/personal candidate; approve intended use/host. Same-origin rewrite must be tested for refresh cookies and SSE. |
| Netlify | [Pricing](https://www.netlify.com/pricing/) and [credit plans](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/): free 300 monthly credits with shared usage and limits. | Do not assume old bandwidth/build-minute allowances. Measure proxy/SSE/deployment usage before choosing. |

Chrome and real Safari persistence/SSE must be tested after deployment; Playwright WebKit is useful but not evidence of a real Safari run. No hosting account, remote URL, DNS, production SMTP or browser-deployment behavior was checked yet.

## Toolchain and candidate dependencies

[Node download](https://nodejs.org/en/download) and [release schedule](https://github.com/nodejs/Release/blob/main/README.md) confirm Node 24 LTS; installed 24.19.0, checked latest LTS patch 24.21.0. Node 26 was Current on this audit date, not the LTS default. pnpm installed 11.19.0 is a Codex runtime fallback; choose a portable pinned packageManager in Phase 1 (proposed 12.8.1). No auto-upgrade performed.

[Docker Windows setup](https://docs.docker.com/desktop/setup/install/windows-install/) requires compatible Windows/WSL2/virtualization. WSL reports Ubuntu, default version 2. Docker executable/service/installation paths were not found; Compose and engine unavailable. Suggested user-approved install: `winget install --exact --id Docker.DockerDesktop`, then launch and verify `docker --version`, `docker compose version`, `docker info`. This command was **not run**. No application build may begin before required toolchain is present and Phase 0 approved.

Registry metadata for **56 latest candidates** is retained in [dependency-audit.json](dependency-audit.json), including source URL, engine range, peer range, repository, license and deprecation field. No candidates were marked deprecated in those responses. Registry metadata is not a vulnerability audit.

**Detected incompatibility:** TypeScript 7.0.2 is outside typescript-eslint 8.71.0's >=4.8.4 <6.1.0 peer range. A separate registry lookup confirmed **TypeScript 6.0.3** as compatible candidate; [evidence](evidence/typescript-peer-resolution.json). Node types latest 26.6.4 should be replaced by observed Node-24 line **24.19.1**. React/react-dom/@types variants should stay aligned at 19.3.0; Vitest/coverage at 5.0.3. Recharts requires compatible react-is; optional peer metadata and actual transitive resolution must be checked on install, not blindly install every peer listed in the registry.

| Package candidate | Registry latest observed | Node engine metadata |
|---|---|---|
| pnpm | 12.8.1 | >=18.* |
| react | 19.3.0 | >=0.10.0 |
| vite | 8.3.2 | ^20.19.0 \|\| >=22.12.0 |
| typescript | 7.0.2 — propose 6.0.3 instead | >=16.20.0 |
| tailwindcss | 4.3.3 | Not declared |
| react-router | 8.4.0 | >=22.22.0 |
| @tanstack/react-query | 5.104.1 | Not declared |
| zustand | 5.0.15 | >=12.20.0 |
| react-hook-form | 7.89.0 | >=18.0.0 |
| @hookform/resolvers | 5.9.1 | Not declared |
| zod | 4.6.5 | Not declared |
| recharts | 3.10.1 | >=18 |
| express | 5.2.1 | >= 18 |
| mongoose | 9.10.4 | >=20.19.0 |
| decimal.js | 10.6.0 | Not declared |
| pino | 10.4.0 | Not declared |
| pino-http | 11.0.0 | Not declared |
| bullmq | 6.3.11 | >=14.17.0 |
| ioredis | 6.0.0 | >=20.0.0 |
| argon2 | 0.45.1 | >=16.17.0 |
| helmet | 8.3.0 | >=18.0.0 |
| vitest | 5.0.3 | ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0 |
| supertest | 7.3.1 | >=14.18.0 |
| mongodb-memory-server | 11.3.0 | >=20.19.0 |
| msw | 3.0.2 | >=22.12.0 |
| nock | 14.0.17 | >=18.20.0 <20 \|\| >=20.12.1 |
| @playwright/test | 1.63.0 | >=20 |
| fast-check | 4.10.2 | >=12.17.0 |
| @testing-library/react | 16.3.3 | >=18 |
| eslint | 10.12.0 | ^20.19.0 \|\| ^22.13.0 \|\| >=24 |
| prettier | 3.9.9 | >=14 |
| @asteasolutions/zod-to-openapi | 9.1.0 | Not declared |
| swagger-ui-express | 5.0.1 | >= v0.10.32 |
| yahoo-finance2 | 4.0.2 | >=22.0.0 |
| rss-parser | 3.13.0 | Not declared |
| otplib | 13.5.0 | Not declared |
| nodemailer | 10.0.14 | >=20.0.0 |
| @fontsource/inter | 5.3.0 | Not declared |
| @fontsource/ibm-plex-mono | 5.3.0 | Not declared |
| react-dom | 19.3.0 | Not declared |
| @vitejs/plugin-react | 6.1.1 | ^20.19.0 \|\| >=22.12.0 |
| @tailwindcss/vite | 4.3.3 | Not declared |
| @types/node | 26.6.4 — propose 24.19.1 instead | Not declared |
| @types/react | 19.3.0 | Not declared |
| @types/react-dom | 19.3.0 | Not declared |
| @types/express | 5.0.6 | Not declared |
| typescript-eslint | 8.71.0 | ^18.18.0 \|\| ^20.9.0 \|\| >=21.1.0 |
| @vitest/coverage-v8 | 5.0.3 | Not declared |
| jsdom | 30.1.1 | ^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0 |
| @testing-library/dom | 10.4.2 | >=18 |
| husky | 9.1.7 | >=18 |
| lint-staged | 17.6.0 | >=22.22.1 |
| lossless-json | 4.3.1 | Not declared |
| express-rate-limit | 8.7.0 | >= 16 |
| rate-limit-redis | 6.0.1 | >= 16 |
| @sentry/node | 11.4.0 | >=20.19.0 <22.0.0 \|\| >=22.12.0 <23.0.0 \|\| >=23.2.0 |

Direct engine metadata accommodates installed Node 24.19.0, but latest packages do not automatically form a compatible stack. No lockfile/install/typecheck/test/security audit or Mongo native-binary/argon2/Playwright download was performed. Phase 1 must resolve peers, install exact approved pins, verify ESM/Express 5/Tailwind 4/React Router 8 APIs against their current primary docs and run real clean-clone gates. Candidate alternatives (Vitest, MSW, decimal.js, argon2id, gallery, typed AI loop) remain O01 proposals.
