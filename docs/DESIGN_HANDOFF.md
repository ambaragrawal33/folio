# Folio design handoff — Phase 0

Audit date: **2026-10-03**. Actual connected Figma file key **0QNLyxaAB3EJUo4llSttjk** was read through MCP. Design is read-only; no Figma nodes/tokens were changed, no UI recreated, and no application code exists.

## Authority, evidence and connectivity

The master specification is the engineering/domain/security/tier authority; [Folio — design](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=0-1) is visual/UX authority. The supplied URL label is Folio — design; Plugin API returned root name “Document”, so a filename match is not independently claimed.

MCP discovery found **42 exposed Figma tools**, preserved with descriptions in [figma-tools.json](evidence/figma-tools.json). Successful read tools used: `use_figma` (page/node traversal, instance/variant/property definitions, variables/styles, paints, text, layout/constraints and screenshots), `get_metadata` (Auth), `get_variable_defs` (Dashboard), `get_screenshot` (Dashboard). Plugin screenshots of Dashboard and Auth were viewed as secondary checks. No `get_design_context` implementation output was requested because Phase 0 forbids implementation; structured Plugin API reads supplied the audit.

All **17 pages, 20 top-level roots, 1,137 FRAME nodes** were enumerated. Product roots: 18 at 1440×1024 for 15 surfaces (News/Goals/Alerts each duplicate). Dashboard root 10:485 is a COMPONENT, not a FRAME. **Unreadable frames: none in the enumerated inventory.** Server truncation on early DS/component reads was detected and recovered using smaller structured reads; final inventory/variables/styles/component results are complete JSON. No prototype reactions were found in inspected pages; their absence does not prove all interaction behavior.

Evidence: [all frame IDs/names/dimensions/layouts](FRAME_INVENTORY.md), [page/component bindings/copy/quality](evidence/figma-pages.json), [representative layout measurements](evidence/figma-layouts.json), [variables](evidence/figma-tokens.json), [styles](evidence/figma-styles.json), [component definitions](evidence/figma-component-families.json), [all 119 component nodes](evidence/figma-component-variants.json), [contrast matrix](evidence/token-contrast.json). These are source observations, not generated application tokens or fidelity passes.

Cover [57:1334](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A1334) was read first. It calls DS and pages 02–10 DONE and 11–16 ADDED, defines the same visual-vs-engineering authority, and calls Watchlist P1 ([57:1366](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A1366)); the spec leaves Watchlist untiered. Cover's Phase 0 “reuse/refactor/rewrite” wording at 57:1392 is obsolete for this empty repository. These discrepancies are recorded, not applied as instructions overriding the user's greenfield scope.

## Screen inventory and P0/P1/P2 verification

Routes below are **suggestions**, not implemented routes. Page order matches §0A.6. P0 ships one default portfolio while schemas support many. An unavailable route/panel policy is still D01/D02 awaiting approval.

| Page / page ID | Actual top root(s) | Suggested route | Tier |
|---|---|---|---|
| 00 Cover / 0:1 | [57:1334](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A1334) | None — handoff | Documentation |
| 01 Design System / 1:2 | [2:4014](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4014) — 1440×4923 | Dev component gallery (proposed) | Phase 1 foundation |
| 02 Dashboard / 1:3 | [10:485](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=10%3A485) | /dashboard | P0; history P1, risk/attribution P2 |
| 03 Holdings / 1:4 | [27:390](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=27%3A390) | /holdings | P0 |
| 04 Asset Detail / 1:5 | [32:143](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=32%3A143) | /holdings/:instrumentId | P0; Watchlist pending |
| 05 Performance / 1:6 | [39:2](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=39%3A2) | /performance | P1; alpha/volatility P2 |
| 06 Risk & Analytics / 1:7 | [45:423](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=45%3A423) | /analytics | P2 |
| 07 Transactions / 1:8 | [47:2](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=47%3A2) | /transactions | P0; portfolio CSV P1 |
| 08 Tax / 1:9 | [50:2](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=50%3A2) | /tax | P2 |
| 09 Watchlist / 1:10 | [53:2](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=53%3A2) | /watchlist | Unassigned; proposed P1 |
| 10 Settings / 1:11 | [54:50](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=54%3A50) | /settings | P0 subset; 2FA/sessions/alerts P1; digest P2 |
| 11 Auth / 55:50 | [57:282](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A282) | /auth/login (extensions /register, /verify-email, /forgot-password, /reset-password, /session-expired, /demo) | P0; Google P2; TOTP P1 |
| 12 Onboarding / 55:51 | [57:301](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A301) | /onboarding | P0 manual; CSV P1 |
| 13 News / 55:52 | [57:21](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A21), [57:335](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A335) | /news | P0; sentiment P1 |
| 14 AI Chat / 55:53 | [57:426](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A426) | /assistant | P0 read-only; writes P1; risk tools P2 |
| 15 Goals / 55:54 | [57:112](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A112), [57:511](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A511) | /goals | P1 |
| 16 Alerts & Notifications / 55:55 | [57:193](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A193), [57:592](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A592) | /alerts | P1; digest P2 |

### 02 Dashboard

Root(s): [10:485](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=10%3A485). Route: `/dashboard`. Tier: **P0; history P1, risk/attribution P2**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary; Folio/Data status; Folio/Tab; Table header; Table row / density.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `surface/selected`, `accent/primary`, `text/secondary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`, `status/positive`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 74 auto-layout nodes / 17 nodes without auto-layout; 70 styled / 50 unstyled text nodes; 240 bound / 6 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Server valuation, costs, realized/unrealized P&L, income, daily change, allocation, concentration, positions preview. P1 snapshots/TWR/benchmarks; P2 approved attribution/risk.

States present/missing: Current data badge and selected tabs; DS default preview rows. Missing zero-holdings/provider failures/partial totals/whole-screen loading and later-panel unavailable states.

Discrepancies: 17:297/426/459 later engines; 17:473 concentration exists; mismatched currency/weight columns. D01/D02/X02/X04/X09.

### 03 Holdings

Root(s): [27:390](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=27%3A390). Route: `/holdings`. Tier: **P0**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary; Folio/Column header; Table row / density; Folio/Pagination item.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `text/secondary`, `surface/selected`, `accent/primary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`, `status/positive`, `space/32`, `status/negative`, `text/disabled`, `space/16`, `radius/subtle`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 62 auto-layout nodes / 23 nodes without auto-layout; 111 styled / 4 unstyled text nodes; 237 bound / 6 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: User-scoped positions search/filter/sort, asset-class/currency/sector metadata, Decimal strings, allocation.

States present/missing: Selected navigation and sort/pagination; default row instances. No dedicated selected-holding, zero results or failed quote state.

Discrepancies: All Accounts lacks model; sort header says Descending; exposure is asset class. D08/X02/X08.

### 04 Asset Detail

Root(s): [32:143](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=32%3A143). Route: `/holdings/:instrumentId`. Tier: **P0; Watchlist pending**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary; Breadcrumb; Folio/Financial delta; Folio/Button/Secondary; Folio/Button/Primary; Folio/Tab.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `text/secondary`, `surface/selected`, `accent/primary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`, `status/positive`, `space/32`, `text/on-accent`, `border/subtle`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 69 auto-layout nodes / 19 nodes without auto-layout; 42 styled / 76 unstyled text nodes; 215 bound / 6 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Canonical instrument metadata, quote/24h or previous-close change, native/display currency, cost per unit, position value, ledger activity, provider history with actual coverage.

States present/missing: Breadcrumb, financial delta, selected tabs, record-action location. Missing history-empty/failure, unavailable metrics, transaction dialog.

Discrepancies: Trade copy, total vs average cost, custody metadata, USD-vs-INR and today-vs-24h. D13/X02/X05/X07.

### 05 Performance

Root(s): [39:2](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=39%3A2). Route: `/performance`. Tier: **P1; alpha/volatility P2**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `text/secondary`, `surface/selected`, `accent/primary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`, `status/positive`, `status/negative`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 14 auto-layout nodes / 42 nodes without auto-layout; 17 styled / 78 unstyled text nodes; 170 bound / 9 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Snapshots/backfill, TWR/XIRR/CAGR, period returns, benchmark series in explicit currency/return convention.

States present/missing: Active period/benchmark, chart/table and methodology note; no observed separate loading/error state.

Discrepancies: No explicit XIRR card; benchmark scale/alpha/risk require methods. D03/X09.

### 06 Risk & Analytics

Root(s): [45:423](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=45%3A423). Route: `/analytics`. Tier: **P2**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `text/secondary`, `surface/selected`, `accent/primary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`, `status/negative`, `border/subtle`, `surface/hover`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 14 auto-layout nodes / 50 nodes without auto-layout; 17 styled / 98 unstyled text nodes; 231 bound / 8 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Covariance volatility/drawdown/beta plus approved Sharpe/Sortino/VaR/correlation/scenario methods, window/source/freshness.

States present/missing: Risk summary/correlation/scenario tables; selected nav. No independent loading/insufficient-history/error states.

Discrepancies: Metrics beyond §4.3 and recovery definition. D03.

### 07 Transactions

Root(s): [47:2](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=47%3A2). Route: `/transactions`. Tier: **P0; portfolio CSV P1**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `text/secondary`, `surface/selected`, `accent/primary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`, `status/positive`, `border/subtle`, `status/negative`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 14 auto-layout nodes / 32 nodes without auto-layout; 17 styled / 130 unstyled text nodes; 234 bound / 6 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: User ledger filters/list/detail, BUY/SELL/DIVIDEND/SPLIT, native currency, historical FX, fees, void status/provenance.

States present/missing: Selected transaction detail, numbered pagination and methodology. No actual add/void-confirmation/state frame; CSV export visible.

Discrepancies: Order/settlement/market-order fields, inverted cash-flow signs and fees; §7 cursor conflict. D08/X02/X03/X07.

### 08 Tax

Root(s): [50:2](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=50%3A2). Route: `/tax`. Tier: **P2**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `text/secondary`, `surface/selected`, `accent/primary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 14 auto-layout nodes / 18 nodes without auto-layout; 17 styled / 202 unstyled text nodes; 69 bound / 261 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: FIFO realized lots, jurisdiction/financial-year and effective-dated rule engine, estimate reports/export.

States present/missing: Summary/table/report panels and estimate notes. No jurisdiction/rule-validation states.

Discrepancies: Prototype rule/date samples inconsistent; literal fonts/colors extensive. D04/X01.

### 09 Watchlist

Root(s): [53:2](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=53%3A2). Route: `/watchlist`. Tier: **Unassigned; proposed P1**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `text/secondary`, `surface/selected`, `accent/primary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 14 auto-layout nodes / 18 nodes without auto-layout; 17 styled / 228 unstyled text nodes; 69 bound / 419 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Proposed user watchlist/items with canonical instruments, prices/history, permitted movers universe and sourced notes.

States present/missing: Selected item, chart/table/movers/notes; absent empty/errors and editing flow.

Discrepancies: Cover says P1 but specification untiered; chart metrics and market notes need approved scope. D13/X01.

### 10 Settings

Root(s): [54:50](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=54%3A50). Route: `/settings`. Tier: **P0 subset; 2FA/sessions/alerts P1; digest P2**.

Observed reusable instances: Folio/Navigation item; Folio/Select; Folio/Search input; Folio/Button/Icon-only; Folio/Button/Tertiary.

Observed variable names: `surface/canvas`, `border/default`, `space/24`, `text/primary`, `space/4`, `space/12`, `radius/none`, `text/secondary`, `surface/selected`, `accent/primary`, `space/20`, `surface/base`, `space/8`, `radius/control`, `text/muted`, `surface/raised`, `radius/full`. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 14 auto-layout nodes / 46 nodes without auto-layout; 17 styled / 53 unstyled text nodes; 68 bound / 102 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Profile/account, initial base currency/FIFO, preferences, user data export/delete; later notification/security settings.

States present/missing: Theme and number-format options, digest/security rows; no account-delete or full save/error flows.

Discrepancies: Persist preferences; scope currency change, export types and unavailable controls. D07/X03/X07.

### 11 Auth

Root(s): [57:282](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A282). Route: `/auth/login (extensions /register, /verify-email, /forgot-password, /reset-password, /session-expired, /demo)`. Tier: **P0; Google P2; TOTP P1**.

Observed reusable instances: none — screen content consists of literal frames/text, so reuse must be reconstructed from the audited DS and reviewed.

Observed variable names: none; literal Dark paints require canonical DS mapping. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 0 auto-layout nodes / 6 nodes without auto-layout; 0 styled / 13 unstyled text nodes; 0 bound / 24 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Authenticated email/password flow, rate limit/CSRF, verification/reset tokens, demo isolation.

States present/missing: Single sign-in form; Forgot and Google text/button; demo is text. Missing register/verify/reset/validation/expiry/2FA frames.

Discrepancies: No components/styles/bindings; Google conflicts P2. D05/X01/X07.

### 12 Onboarding

Root(s): [57:301](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A301). Route: `/onboarding`. Tier: **P0 manual; CSV P1**.

Observed reusable instances: none — screen content consists of literal frames/text, so reuse must be reconstructed from the audited DS and reviewed.

Observed variable names: none; literal Dark paints require canonical DS mapping. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 0 auto-layout nodes / 12 nodes without auto-layout; 0 styled / 22 unstyled text nodes; 0 bound / 45 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Account stage status, default portfolio INR/FIFO, instrument search/manual ledger, review, real data status.

States present/missing: Only portfolio stage rendered, Account→Portfolio→Transactions→Review rail, static degraded notice, CSV option.

Discrepancies: Manual transaction and review missing; CSV hidden in P0. D06/X01/X07.

### 13 News

Root(s): [57:21](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A21), [57:335](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A335). Route: `/news`. Tier: **P0; sentiment P1**.

Observed reusable instances: none — screen content consists of literal frames/text, so reuse must be reconstructed from the audited DS and reviewed.

Observed variable names: none; literal Dark paints require canonical DS mapping. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 0 auto-layout nodes / 68 nodes without auto-layout; 0 styled / 108 unstyled text nodes; 0 bound / 240 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Permitted RSS metadata, real symbol tags, news cursor/search/source filters, portfolio relevance, as-of; source article links.

States present/missing: Selected For You tab, feed/list and selected article detail, freshness/demo banner; missing empty/error/offline states.

Discrepancies: For You/Market vs General/Portfolio, searched sources not all specified feeds, Saturday Market Open copy static; duplicate roots. D09/X01/X05.

### 14 AI Chat

Root(s): [57:426](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A426). Route: `/assistant`. Tier: **P0 read-only; writes P1; risk tools P2**.

Observed reusable instances: none — screen content consists of literal frames/text, so reuse must be reconstructed from the audited DS and reviewed.

Observed variable names: none; literal Dark paints require canonical DS mapping. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 0 auto-layout nodes / 30 nodes without auto-layout; 0 styled / 48 unstyled text nodes; 0 bound / 110 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Owned conversations/messages, actual authenticated tool calls, numeric facts/currency/as-of, validated response, supported tool cards.

States present/missing: READ ONLY label, rendered response, suggested prompts, grounding panel, advice guardrail; missing streaming/failure/cancel/confirmation states.

Discrepancies: Sharpe/performance/risk sample cards unsupported P0; no styles/bindings. D10/X01/X06.

### 15 Goals

Root(s): [57:112](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A112), [57:511](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A511). Route: `/goals`. Tier: **P1**.

Observed reusable instances: none — screen content consists of literal frames/text, so reuse must be reconstructed from the audited DS and reviewed.

Observed variable names: none; literal Dark paints require canonical DS mapping. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 0 auto-layout nodes / 68 nodes without auto-layout; 0 styled / 90 unstyled text nodes; 0 bound / 220 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Owned goal target/date, optional portfolio, simulator and approved status trajectory; decimal amounts.

States present/missing: On-track/at-risk cards and All Portfolios context; no association edit or validation states.

Discrepancies: Summary's multiple-per-goal portfolios not evidenced; overlapping duplicate roots. D11/X01.

### 16 Alerts & Notifications

Root(s): [57:193](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A193), [57:592](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=57%3A592). Route: `/alerts`. Tier: **P1; digest P2**.

Observed reusable instances: none — screen content consists of literal frames/text, so reuse must be reconstructed from the audited DS and reviewed.

Observed variable names: none; literal Dark paints require canonical DS mapping. Text-style references and representative node-level sizing/padding/bindings are in layout evidence. 0 auto-layout nodes / 64 nodes without auto-layout; 0 styled / 108 unstyled text nodes; 0 bound / 232 literal fill/stroke occurrences. Counts are occurrences, not unique tokens. Core constraint patterns are MIN/MIN and mostly fixed desktop sizing; they do not establish mobile behavior.

Data requirements: Owned typed alert conditions/currency, crossing/last evaluation, deduped notification cursor, provider freshness, audit metadata.

States present/missing: Price/portfolio/provider notices, degraded suppression panel and recurring digest; missing creation/edit/failed-delivery states.

Discrepancies: Transaction anomaly vs market anomaly and daily vs weekly digest; duplicate roots. D12/X01.

## Design System component inventory

**26 families** = 21 component sets plus 5 standalone components, containing **119 COMPONENT nodes** on the DS page. Dashboard shell component 10:485 is separate. Build shared primitives once; migrate duplicate row representations to one shared row API retaining observed densities.

| Figma family | Node | Component count | Actual variant dimensions / properties |
|---|---|---|---|
| Folio/Button/Primary | [2:4893](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4893) | 10 | State: Default, Hover, Pressed, Focus, Disabled; Size: Default, Compact; Icon: None; 1 text props |
| Folio/Button/Secondary | [2:4894](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4894) | 10 | State: Default, Hover, Pressed, Focus, Disabled; Size: Default, Compact; Icon: None; 1 text props |
| Folio/Button/Tertiary | [2:4895](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4895) | 10 | State: Default, Hover, Pressed, Focus, Disabled; Size: Default, Compact; Icon: None; 1 text props |
| Folio/Button/Destructive | [2:4896](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4896) | 10 | State: Default, Hover, Pressed, Focus, Disabled; Size: Default, Compact; Icon: None; 1 text props |
| Folio/Button/Icon-only | [7:153](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=7%3A153) | 10 | State: Default, Hover, Pressed, Focus, Disabled; Size: Default, Compact; Icon: Only; 0 text props |
| Folio/Size and icon button | [2:4879](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4879) | 3 | State: Default; Size: Compact, Large, Default; Icon: None, Leading; 4 text props |
| Folio/Text input | [2:4880](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4880) | 6 | State: Default, Hover, Focus, Error, Disabled, Read only; 6 text props |
| Folio/Select | [7:88](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=7%3A88) | 6 | State: Default, Hover, Focus, Error, Disabled, Read only; 3 text props |
| Folio/Search input | [7:109](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=7%3A109) | 6 | State: Default, Hover, Focus, Error, Disabled, Read only; 3 text props |
| Folio/Numeric input/State=Filled, Unit=Percent | [2:4831](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4831) | 1 | Standalone; no full state matrix; 2 text props |
| Folio/Checkbox | [2:4881](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4881) | 4 | State: Unchecked, Checked, Indeterminate, Disabled; 1 text props |
| Folio/Radio | [2:4882](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4882) | 3 | State: Unselected, Selected, Disabled; 1 text props |
| Folio/Switch | [2:4883](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4883) | 3 | State: Off, On, Disabled; 1 text props |
| Folio/Navigation item | [2:4884](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4884) | 4 | State: Default, Hover, Selected, Disabled; 1 text props |
| Folio/Tab | [2:4885](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4885) | 4 | State: Selected, Default, Hover, Disabled; 1 text props |
| Folio/Breadcrumb/State=Default | [2:4850](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4850) | 1 | Standalone; no full state matrix; 2 text props |
| Folio/Pagination item | [2:4886](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4886) | 5 | State: Disabled, Default, Selected, Hover; Type: Arrow, Page; 3 text props |
| Folio/Financial value | [2:4887](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4887) | 4 | State: Positive, Negative, Flat, Unavailable; Format: Currency; 15 text props |
| Folio/Financial delta | [2:4888](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4888) | 4 | State: Positive, Negative, Flat, Unavailable; Format: Percent; 4 text props |
| Folio/Data status | [2:4889](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4889) | 3 | State: Current, Stale, Unavailable; 1 text props |
| Folio/Table header/State=Default, Density=Compact | [2:4867](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4867) | 1 | Standalone; no full state matrix; 7 text props |
| Folio/Table row | [2:4890](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4890) | 4 | State: Default, Hover, Selected, Disabled; Density: Compact; 8 text props |
| Folio/Table summary/State=Default | [2:4872](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4872) | 1 | Standalone; no full state matrix; 4 text props |
| Folio/Table row /State=Default, Density=Default | [2:4873](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4873) | 1 | Standalone; no full state matrix; 8 text props |
| Folio/Column header | [2:4891](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4891) | 3 | State: Unsorted, Ascending, Descending; 1 text props |
| Folio/Content | [2:4892](https://www.figma.com/design/0QNLyxaAB3EJUo4llSttjk/Folio---design?node-id=2%3A4892) | 2 | State: Empty, Loading; 2 text props |

Buttons have Default/Hover/Pressed/Focus/Disabled at 36px and Compact 32px, while the legacy Size/icon showcase is only three combinations. Text/Select/Search have six states including Error/Readonly. Checkbox/Radio/Switch state coverage is partial; do not claim a complete keyboard/focus/error matrix from their presence. Financial value/delta have Positive/Negative/Flat/Unavailable; Data status Current/Stale/Unavailable; Content only Empty/Loading. Pagination and table density variants are partial.

Core shell measurements: sidebar 220px; workspace 1220px; top bar 56px; main 1220×968, content padding [28,32,28,32]. 28px has no dimensions variable. Main chart/table bounds and 10px cell gaps likewise need traced geometry roles. Shell 10:485 includes Dashboard content; planned React shell must expose content slots while preserving geometry. News/AI/Alerts navigation entries on core screens are literal frames (57:782/784/786) while original nav entries are instances. Never invent icons not present without approval.

No shared dialog/confirmation/toast/data-error system was found. These are required extensions, not evidence that those states were designed. “Execute trade” and “Close position” are default button text properties, conflicting with information-only product behavior (X02).

## Token and typography plan

Extracted 49 variables in 3 collections; all variable scopes are ALL_SCOPES and codeSyntax maps are empty. No variable aliases were found in valuesByMode. Provenance must include collection IDs/mode IDs to avoid collisions.

| Collection | ID | Modes | Variables | Planned treatment |
|---|---|---|---|---|
| Folio · Semantic colors | VariableCollectionId:2:4938 | Dark (2:2), Light (13:1) | 23 | Canonical export, read directly from MCP |
| Folio · Dimensions | VariableCollectionId:2:4939 | Foundation (2:3) | 17 | Canonical export, read directly from MCP |
| Folio · Shell appearance compatibility | VariableCollectionId:13:50 | Existing shell (13:0) | 9 | Legacy duplicate names; preserve as evidence, avoid selecting by name |

Actual semantic values (extracted, not manually selected): the reference palette listed in §0A.5 matches the corresponding semantic variables. Additional semantic background/on-accent variables and the legacy compatibility collection are preserved in raw evidence; the latter has duplicate names and differing legacy colors and must not override the canonical palette by name.

| Variable | ID | Dark | Light |
|---|---|---|---|
| surface/canvas | VariableID:2:4940 | #080808 | #F7F7F5 |
| surface/base | VariableID:2:4941 | #101010 | #FFFFFF |
| surface/raised | VariableID:2:4942 | #151515 | #F2F2EF |
| surface/hover | VariableID:2:4943 | #1B1B1B | #EBEBE7 |
| border/default | VariableID:2:4944 | #2B2B2B | #D3D3CE |
| border/strong | VariableID:2:4945 | #3A3A3A | #B8B8B2 |
| text/primary | VariableID:2:4946 | #F5F5F5 | #111111 |
| text/secondary | VariableID:2:4947 | #B5B5B5 | #454545 |
| text/muted | VariableID:2:4948 | #7A7A7A | #737373 |
| text/disabled | VariableID:2:4949 | #555555 | #A3A3A3 |
| accent/primary | VariableID:2:4950 | #D8A900 | #B58A00 |
| surface/selected | VariableID:2:4951 | #242424 | #E5E3DA |
| status/positive | VariableID:2:4952 | #3FA66B | #217A4A |
| status/negative | VariableID:2:4953 | #E05252 | #C73535 |
| status/warning | VariableID:2:4954 | #D8A900 | #A87500 |
| status/positive-bg | VariableID:2:4955 | #10271C | #EAF5EE |
| status/negative-bg | VariableID:2:4956 | #2A1515 | #FBECEC |
| status/warning-bg | VariableID:2:4957 | #29220E | #F8F1D9 |
| accent/hover | VariableID:7:26 | #E5B800 | #966F00 |
| accent/pressed | VariableID:7:27 | #BD9200 | #795900 |
| border/subtle | VariableID:13:60 | #1A1A1A | #E7E7E3 |
| text/on-accent | VariableID:13:61 | #111111 | #111111 |
| text/on-accent-strong | VariableID:13:364 | #111111 | #FFFFFF |

Dimension values: space/2=2; space/4=4; space/8=8; space/12=12; space/16=16; space/24=24; space/32=32; space/48=48; radius/none=0; radius/subtle=2; radius/control=6; radius/panel=8; radius/full=999; space/20=20; space/40=40; space/64=64; radius/large=12.

Eight text styles; no paint/effect/grid styles were returned. These absences are not permission to add shadows or decorative styling.

| Style | Font | Size / line height |
|---|---|---|
| Folio/type/title | Inter Semi Bold | 32 / 38px |
| Folio/type/section | Inter Semi Bold | 18 / 24px |
| Folio/type/heading | Inter Semi Bold | 15 / 20px |
| Folio/type/body | Inter Regular | 14 / 20px |
| Folio/type/compact | Inter Medium | 13 / 18px |
| Folio/type/caption | Inter Medium | 11 / 14px |
| Folio/type/numeric | IBM Plex Mono Regular | 13 / 18px |
| Folio/type/metric | IBM Plex Mono Medium | 24 / 32px |

Phase 1 proposed pipeline: re-runnable read-only MCP sync → versioned provenance JSON → generated CSS custom properties under `data-theme=dark|light` → Tailwind theme mapping; chart colors and shared primitives consume identical tokens. Numeric values use self-hosted IBM Plex Mono/tabular figures/right alignment; UI text self-hosted Inter. Geometry missing variables gets a generated, source-node-derived role in the token package, with the deviation logged, never a screen literal. Normalize exact literal matches first; do not arbitrarily round Figma spacing/type. Match fonts to audited style weights; font license distribution must be preserved.

Core pages 02–10 select Dark explicitly; all product frames are Dark references. **No separate Light, mobile or tablet product frame was found**. Dark/Light semantic modes are genuine, but Light fidelity cannot be claimed against a missing Light product reference. X01/D14 require approval for derived Light/responsive review.

## Actual contrast audit

Opaque sRGB relative luminance used `(Llighter+0.05)/(Ldarker+0.05)`. [Matrix](evidence/token-contrast.json) covers semantic text/status/accent against all five surfaces in both modes. Structural page audit pairs text with nearest ancestor fill; clipping/sibling backgrounds, transparency, hover composition and focus indicators need render-time verification. This is not an exhaustive WCAG certificate. Normal small text needs 4.5:1; inactive-control exceptions do not excuse ordinary captions.

| Actual pair | Dark ratio | Light ratio | Finding |
|---|---|---|---|
| text/muted / surface/base | 4.433 | 4.742 | Dark normal-text failure |
| text/muted / surface/raised | 4.254 | 4.228 | Both fail |
| text/muted / surface/selected | 3.616 | 3.688 | Both fail |
| accent/primary / surface/selected | see matrix | 2.474 | Light selected nav 13px fails |
| status/negative / surface/base | 4.982 | 5.264 | Both pass; spec's approximate Dark-base estimate is inaccurate |
| status/negative / surface/selected | 4.064 | 4.094 | Both fail small text |
| status/warning / surface/base | see matrix | 4.031 | Light warning small text fails |

Examples: DS selected navigation 2:4528 / Dashboard I10:400;2:4528, search 7:92, stale label 2:4640, Auth placeholder 57:289 (literal ratio 4.073). Dark warning and accent share gold; warning requires icon/label, not hue alone. Typography audit flagged Inter financial values on Watchlist (53:1496) and Goals; heuristic hits like “INR ₹” labels are not automatically numeric-font defects. Existing source tokens remain unchanged. D15 records the approval needed for accessible text roles or designer token revisions.

## Discrepancy register

[DECISIONS.md](DECISIONS.md) verifies **all fifteen §0A.7 items D01–D15** against actual nodes and gives options/defaults/timing. Additional X01–X10 capture DS bindings/duplicate references, trading and wrong financial labels, ledger/schema gaps, missing-data/day-change/FX semantics, provider history/freshness, grounding-vs-streaming, missing workflows, unsupported search/account filters, benchmark/tier conflicts and P1 metals/CSV semantics. None has been silently accepted.

## Not in Figma — added

**Added in application: none.** No implementation is authorized. The following planned extensions must be logged with source primitives, rationale, screenshots and user design-review outcome when implemented:

| Extension | Tier / phase | Existing language to reuse |
|---|---|---|
| Register, verify/resend, forgot/reset, expired session, full validation/CSRF/rate-limit messaging | P0 / 2 | TextInput, primary/tertiary buttons, Content, DataStatus |
| Manual transaction add, split/dividend forms, FX override, void confirmation and audit reason | P0 / 3 | Select/numeric/text inputs, destructive button, table/detail styles |
| Onboarding manual entry/review and usable isolated demo entry | P0 / 2–3 | Auth/onboarding layout + input/table primitives |
| Privacy account export/delete, currency-lock notice, preference-save feedback | P0 / 2–3 | Settings typography/forms, destructive action pattern |
| Unavailable routes/panels, no positions/results, provider failure/partial valuation/as-of and market states | P0 / 1–4 | Content Empty/Loading, FinancialValue Unavailable, DataStatus |
| News source failure/empty/offline/search, real symbol relevance | P0 / 4 | News structure, tabs/search/status/content |
| AI tool progress/cancel/grounding retry/fallback and safe validated streaming | P0 / 5 | Chat layout, status/content, table/data-card language |
| Light theme product references and tablet/mobile layouts | P0 onward | Existing semantic modes/DS, reviewed responsive adaptations |
| Goal edit/status, alert edit/currency/kinds, CSV dry-run/import errors | P1 / 7 | Inputs/tables/status/confirmation extensions |
| TOTP challenge/session revoke, AI pending-action confirmation card | P1 / 8 | Existing form/destructive/status patterns |

No extension implies authorization to write to Figma. Any actual Figma modification requires a separate explicit request.

## Fidelity status

No screen has been implemented; every per-screen fidelity gate is **NOT RUN**. Before each screen build, re-inspect the approved canonical live node; compare our render at 1440×1024 for layout, density, typography, tokens, reuse and all states in both themes. Record derived Light limitations and approved deviations, then establish our own approved Playwright screenshot baselines. Recheck token-pair contrast and complete focus/keyboard/accessibility coverage on rendered states. Phase 0 observations must not become invented fidelity passes.
