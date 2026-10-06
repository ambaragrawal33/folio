# Server-authoritative transaction preview

Priority 3, 2026-10-06. Local-only implementation; no provider activation or production entitlement claim.

## Request and authorization

`POST /api/v1/portfolios/:portfolioId/ledger/preview` takes the existing strict `TransactionInput` JSON body: canonical instrument ID, BUY/SELL/DIVIDEND/SPLIT fields, effective UTC instant, exchange trading date and optional sourced historical FX override. Authentication, owned-portfolio scope, JSON/Origin/CSRF rules and Redis portfolio POST throttling apply. Public read-only demo identities cannot preview writes. Arbitrary symbols and unknown fields are rejected. Response is `no-store`.

Preview reads owned portfolio and ledger in a Mongo snapshot and reuses the existing Decimal ledger replay. It creates no economic/void record, projection, portfolio/user revision or booking audit. The reserved candidate ID is in memory only. Operational security throttling and provider cache activity are separate from financial mutation.

## Strict response fields

- `input`, `instrument`, `portfolioId`, `portfolioRevision`, `baseCurrency`: resolved material inputs and canonical metadata.
- `fxMode`: `identity`, `automatic` or `override`. `fx` contains exact decimal-string `rate`, actual `rateDate`, allowlisted `source` and provenance `reference`.
- `effects`: decimal-string `grossNative`, `feesNative`, `nativeCashFlow`, `grossBase`, `feesBase`, `baseCashFlow`; `before`/`after` position summaries with quantity, local/base remaining cost, average local cost, cumulative realized local/base P&L and net dividend local/base income; `quantityChange`, `localCostChange`, `baseCostChange`, `realizedLocalChange`, `realizedBaseChange`, `dividendLocalChange`, `dividendBaseChange`.
- `issuedAt`, `expiresAt`: ISO timestamps, three-minute validity.
- `receipt`: opaque signed binding sent back only in the confirmation header; not authorization, not stored as a ledger record and redacted from logs.

Cash-flow conventions remain BUY negative gross plus fees, SELL positive proceeds less fees, DIVIDEND positive gross less withholding, SPLIT zero. Base amounts multiply exact historical FX. Effects compare the complete ordered ledger before/after insertion; a backdated event can change later FIFO results. These are economic effects, not current market valuation or predicted unrealized P&L. Cash remains excluded from holdings valuation. Full decimal values are available in the review; display formatting alone rounds them.

## FX and confirmation

Identity uses rate 1. Automatic FX retains actual selected date/source/reference; missing history never uses today's rate. An explicitly sourced manual override is visibly distinguished and must be valid on or before the trading date. Cached historical observations marked stale are rejected for preview/confirmation, while existing valuation cache behavior is preserved. Explicit local fixture FX stays labelled synthetic and isolated.

HTTP `POST /api/v1/portfolios/:portfolioId/ledger` requires both `Idempotency-Key` and `Transaction-Preview` headers and the same body. The receipt binds owner/auth version, portfolio revision/sequence, request, canonical metadata, actual FX and exact replay effects. Each Mongo transaction attempt resolves and compares inputs again before writes; expiry is checked again before returning from the transaction callback. Conflicting writes retry against fresh state and stale reviews fail closed. Revalidation only creates a new preview; a separate user confirmation is always required.

An already-booked matching idempotency retry returns the original immutable record even after receipt expiry. A changed payload with the same key is rejected. An uncertain response must be retried with the original key, not silently rebooked. Trusted internal seed/test service calls retain their existing append interface; the HTTP boundary always supplies the receipt argument.

## Errors and limits

400: malformed values/dates, future transaction, exchange-date mismatch or identity override. 401: no valid session. 403: CSRF or read-only demo. 404: unowned portfolio or unknown canonical instrument, without cross-user disclosure. 422: invalid financial replay, unsupported currency, unavailable/invalid/stale historical FX. 428 `PREVIEW_REQUIRED`: confirmation lacks a preview. 409 `PREVIEW_INVALID`, `PREVIEW_EXPIRED`, `PREVIEW_CHANGED`: revalidate and review; `IDEMPOTENCY_CONFLICT`: key used for different inputs. 429: bounded POST rate exceeded. All errors use the existing safe envelope; no provider secrets/schema internals are rendered.

Database state is atomic; external providers cannot be transaction-locked. The bounded provider/cache observation is compared on each transaction attempt and actual accepted provenance is stored immutably. No claim of upstream locking, live-price acceptance or commercial licensing. Current supported currencies remain INR/USD and the approved 13-instrument universe is unchanged. FIFO lots/activity UI, jobs, CRUD, News and AI remain outside this pass.
