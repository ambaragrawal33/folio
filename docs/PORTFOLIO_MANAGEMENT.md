# Single-default portfolio management

Priority 6 / approved L02 only. No multi-portfolio, switching, account groups or new accounting rules.

## Contracts

- `GET /api/v1/portfolios/:portfolioId/management`: owned, read-only consistent Mongo snapshot; `{portfolio, canDelete, deletionReason}`.
- `PATCH /api/v1/portfolios/:portfolioId`: strict JSON `{name, expectedVersion}`; returns the owned Portfolio. Name is trimmed, bounded to 1–100 characters, with Unicode letters/marks/numbers, spaces and `. , ' ’ & ( ) _ + - /`. HTML, embedded controls, bidi/zero-width characters and unknown fields are rejected. All displayed names are React/native text, never HTML.
- `DELETE /api/v1/portfolios/:portfolioId`: strict JSON `{confirmation:"DELETE", expectedVersion}` plus UUID `Idempotency-Key`; returns `{portfolioId, deletedAt, duplicate}`. Empty-only removal, no hidden force or cascade.

All routes require authenticated ownership and no-store; writes reuse Origin/JSON/CSRF and Redis throttling. Unknown/unowned/deleted reads have the same safe404 envelope. Public demo writes remain forbidden. Management GET does not book/audit/change financial state.

## Concurrency and exact emptiness

`managementVersion` is metadata only (legacy documents read as0); successful changed-name writes increment it. Same-name retries are safe and add no duplicate audit. Different stale edits return409 `PORTFOLIO_CHANGED`. Financial `revision`, sequence, currency lock, FIFO, values and valid transaction previews remain unchanged by rename. Existing audit events remain intact; management appends its own audit events.

Deletion is unavailable if **any original economic record**, void event, position projection, positive financial revision/sequence, currency lock or dirty economic timestamp exists. This includes fully sold and voided history, zero-quantity projections and inconsistent economic state. The API explains that selling/voiding does not erase history; keep/rename the portfolio instead. Privacy account erasure is a separate existing action in Data & Export.

Rename/delete reuse the same transactional owned-user `domainVersion` write as append/void/create/refresh admission and account erasure. Mongo write-conflict retry re-reads owned state. Delete cannot win against a committed economic append or leave a concurrent append orphaned. All emptiness checks and portfolio removal, deletion receipt and audit append share one Mongo transaction. Void/projection exists lookups are indexed; no per-record reads or financial replay for eligibility.

`portfolio_deletions` keeps immutable owned receipts: portfolio ID, UUID, deterministic request hash and time. Matching original-key/payload retry returns its original receipt, even after a replacement exists. Changed payload/key reuse returns409; another owner's receipt is never resolved. The comparison hash is stable SHA256 like ledger request hashes, independent of rotating development auth secrets; authentication/ownership is still required on every retry. No provider key/financial record/auth token enters receipts.

Only the portfolio row is ordinarily deleted. Economics/voids/projections are not erased; they block deletion. Canonical instruments, shared quotes/history and owned operational job history remain. Deleted-portfolio job/read endpoints fail owned lookup; no recreation of the deleted ID. A new explicit `POST /portfolios/default` creates one new ID with existing INR/FIFO rules. Nothing is automatically created or switched.

## UI and privacy

Existing portfolio defaults/Settings controls, semantic roles and natural document flow are reused. Rename updates the owned list immediately, revalidates management eligibility and preserves ledger/valuation/job caches. Delete confirmation focuses its heading; cancel restores trigger focus. Pending controls are disabled. Uncertain responses retain the exact UUID/payload and offer explicit retry.

Successful deletion cancels/removes only that portfolio's financial/management/job cache and updates the owned list; navigation enters the existing first-portfolio flow with a focused factual deletion notice. Stale unavailable-resource recovery clears scoped cache and returns to that boundary without claiming a new deletion. New default creation is explicit. Existing logout/login behavior is unchanged.

Account privacy export includes safe owned deletion IDs/times, without request hashes/keys. The existing account-erasure transaction removes owned receipts and economic history as its separate approved exception. Ordinary portfolio deletion does not inherit that cascade. No receipt/financial record can be recreated by retry after account erasure.

Isolated fixture defaults regenerate development signing keys on API restart; persistence verification explicitly reauthenticates. This does not change normal configured secret handling or the fail-closed production gate. Provider entitlements, production operations and the final500-transaction performance task remain separate.
