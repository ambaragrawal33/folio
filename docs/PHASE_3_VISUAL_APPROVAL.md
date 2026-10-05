# Phase 3 final engineering and visual approval

Recorded **2026-10-05**, from the user's explicit **PHASE 3 FINAL VISUAL APPROVAL**. **Engineering APPROVED; visual approval gate CLOSED / APPROVED; Phase 3 itself OPEN.** This is a documentation-only approval record, with no implementation, Figma, palette, foundation or screenshot-baseline change.

Reviewed implementation: **codex/phase-3-domain**, **9db1a60a1f4c014d8225cc44025fef7b753204de**. At the focused review boundary its working tree was clean, origin synchronized and main unchanged at **18223b68caf90235b59fabbfb3924140580d79b6**. A subsequent documentation commit does not change that approved implementation.

## Explicit user-approved scope

The user reviewed the original Dark desktop evidence, the focused Light/mobile pack, all 14 requested states, 390×844 navigation OPEN, source/derivation/accessibility notes, rendered captures and full-page continuations.

| Area                                                                       | User decision       |
| -------------------------------------------------------------------------- | ------------------- |
| A — Typography / hierarchy                                                 | APPROVED            |
| B — Existing colors / tokens / surfaces / borders                          | APPROVED            |
| C — Dashboard complete / partial / empty / stale / unavailable treatment   | APPROVED            |
| D — Holdings columns / density / filters / sorting / unavailable valuation | APPROVED            |
| E — Transactions / append-only terminology / financial columns             | APPROVED            |
| F — Asset Detail / provenance / unavailable history / cost-based return    | APPROVED            |
| G — BUY / SELL / DIVIDEND / SPLIT derived workflows                        | APPROVED            |
| H — Historical FX override / provenance                                    | APPROVED            |
| I — Transaction Review / confirmation                                      | APPROVED            |
| J — Void / destructive workflow                                            | APPROVED            |
| K — Portfolio Settings INR / FIFO / currency lock                          | APPROVED            |
| L — Demo isolation / fixture labels / disabled writes                      | APPROVED            |
| M — Light desktop                                                          | APPROVED AS DERIVED |
| N — 390×844 mobile                                                         | APPROVED AS DERIVED |
| O — Mobile navigation OPEN                                                 | APPROVED AS DERIVED |
| P — Keyboard / focus / ARIA / mobile route collapse                        | APPROVED            |
| Q — Accessibility substitutions                                            | APPROVED            |

**Light and mobile remain DERIVED implementations, never Figma-approved.** The user approves them through this product review against existing Figma DS/source references. Dedicated matching Light/mobile product reference frames do not exist. This approval preserves the existing distinction and all Phase 1/2 approvals; it does not create or replace automated screenshot baselines.

## Reviewed evidence and provenance

[Engineering results](PHASE_3_EVIDENCE.md), [original capture/source review](PHASE_3_VISUAL_REVIEW.md), [source mappings/intentional differences](DESIGN_HANDOFF.md) and the [original 44-capture inventory](evidence/phase-3/visual/capture-inventory.md) preserve the measured implementation/source evidence; only approval status is updated. The focused pack was generated outside the repository to preserve a clean evidence-only review boundary; its original PNGs and PDF were not modified by this approval update.

Focused states: eight Light 1440×1024 desktop states and six Light 390×844 mobile states. Each has an exact viewport PNG plus an unaltered full-page PNG. The reviewed PDF has 24 rendered pages including labelled continuations. Per-state source/derivation/accessibility notes and machine measurements accompany the pack.

| #   | Actual requested state                                | Viewport  | Horizontal overflow | Independent vertical scrollers | Axe violations |
| --- | ----------------------------------------------------- | --------- | ------------------- | ------------------------------ | -------------- |
| 1   | Dashboard — complete labelled read-only demo          | 1440×1024 | 0px                 | 0                              | 0              |
| 2   | Dashboard — genuinely empty normal portfolio          | 1440×1024 | 0px                 | 0                              | 0              |
| 3   | Holdings — actual ledger / unavailable quote          | 1440×1024 | 0px                 | 0                              | 0              |
| 4   | Transactions — actual economic records                | 1440×1024 | 0px                 | 0                              | 0              |
| 5   | Asset Detail — TCS / provenance / unavailable history | 1440×1024 | 0px                 | 0                              | 0              |
| 6   | Manual BUY — explicit historical FX override draft    | 1440×1024 | 0px                 | 0                              | 0              |
| 7   | Transaction Review — unrecorded draft                 | 1440×1024 | 0px                 | 0                              | 0              |
| 8   | Portfolio Settings                                    | 1440×1024 | 0px                 | 0                              | 0              |
| 9   | Dashboard — incomplete normal valuation               | 390×844   | 0px                 | 0                              | 0              |
| 10  | Holdings — stacked labelled rows                      | 390×844   | 0px                 | 0                              | 0              |
| 11  | Manual BUY / historical FX draft                      | 390×844   | 0px                 | 0                              | 0              |
| 12  | Transaction Review                                    | 390×844   | 0px                 | 0                              | 0              |
| 13  | Portfolio Settings                                    | 390×844   | 0px                 | 0                              | 0              |
| 14  | Navigation OPEN — Transactions selected               | 390×844   | 0px                 | 0                              | 0              |

Historical focused browser result: **2/2 tests passed in 32.1s**, 14 axe analyses with zero violations. Gallery verification loaded all 14 visible state articles/22 displayed images with no failed requests; all 28 original PNG hashes remained unchanged. These are prior measured review results, not tests rerun by this documentation change. Human approval now comes from the user's explicit decision, not automated checks.

The normal portfolio used real local UI/API ledger writes, without fabricated provider responses; its temporary accounts were deleted via the real privacy boundary. The dedicated demo remained visibly fixture-labelled/read-only. AAPL FX override was an explicitly labelled unrecorded draft, not an observed live exchange rate.

Approved measured mobile menu: 56px top bar; inline menu y=56..513, 390px wide/457px high; position static and overflow-y visible; menu scrollHeight=clientHeight=456px. Main moves from y=56 to 513 in document flow. Backdrop/modal/viewport overlay count 0. Transactions has aria-current=page/selected surface/2px edge. Keyboard Enter opens; Escape closes/removes the menu and sets aria-expanded=false; keyboard route selection to Holdings collapses it. Desktop portfolio/currency/search/account context and notification text stay hidden; the existing disabled notification icon remains. No independent menu scroll or horizontal overflow.

Reviewed local artifacts retain these identifiers:

| Artifact                        | SHA-256                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| phase-3-light-mobile-review.pdf | 4375c75efdb4a02940d07dadcff41139a6b0eae291f4ec63962e03c2c149955f |
| phase-3-light-mobile-review.zip | 29d333f7f9439cd759f44c3f89f08835c767e219906dd9bba168ffdf3f9494bc |

Their local directory is `C:/Users/ambar/.codex/visualizations/2026/10/03/01a102b1-0ae8-75b3-b117-8a7842c0cd79/phase-3-light-mobile-review`; the ZIP is beside it. These are local artifacts, not a public deployment URL. Connected Figma MCP evidence was read-only; this documentation update makes no Figma call or change.

## Separate operational gates — still unresolved

| Gate                      | Required separate decision and verification                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O02                       | Concrete ₹0/free-tier hosts/accounts and generated public subdomains; Atlas Free/compatible persistent Redis; actual HTTPS/same-origin API proxy/trusted-proxy/IP boundaries/Secure-cookie topology and deployed smoke. No paid service or custom domain authorized. |
| O04                       | Genuine production email requirement, selected compatible provider/permitted sender, safely configured credentials and actual delivery verification. MailHog remains development-only; read-only demo does not waive this gate.                                      |
| O06 operations            | Scheduler/authenticated trigger, encrypted backups/destination/retention/key policy and actual restore verification. Approved read-only demo isolation is separate from scheduler/backup approval.                                                                   |
| Applicable provider gates | Yahoo display/history entitlement remains unverified; CoinGecko Demo requires safely configured key and actual keyed smoke before relevant activation. No license/coverage/readiness inference or invented prices.                                                   |

[DEPLOYMENT.md](DEPLOYMENT.md) retains concrete operational limitations and outstanding evidence. No proposal is converted to an approved provider/host/account, and no operational gate is waived. Local health/smoke/fixtures do not establish public production readiness. Phase 3 is **NOT CLOSED**.

**STOP after recording approval.** Await the user's separate deployment/operational authorization. Do not change the visual implementation or Figma, alter Phase 1/2 baselines, merge Phase 3 to main, start Phase 4, or begin News/AI.
