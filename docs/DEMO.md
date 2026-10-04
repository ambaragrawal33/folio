# Folio read-only demo

Phase 3 implements an isolated local read-only demo through the real ledger/valuation engine. **No public demo URL/deployment exists.** O06 excludes shared writable/per-visitor sandboxes. Hosting/email/backup operations are pending; [deployment boundary](DEPLOYMENT.md).

```sh
docker compose -f docker-compose.yml -f docker-compose.demo.yml --profile demo up --build -d --wait --wait-timeout 300
```

Open http://localhost:5180/auth/login and choose **Explore read-only demo**. No public demo password: the server creates a rotating session for a verified fixture identity. Separate normal application http://localhost:5173 retains real MailHog registration/login and writable owned portfolios; normal accounts never receive fixtures.

Demo database folio_demo/cache namespace folio:demo. Every screen labels fixture data, sources/dates and stale status. Five positions/nine immutable economics span NSE/BSE/global equity/ETF/crypto, with no MF/gold or Figma sample values. Hand-computed aggregate INR215316 value/186205.4 cost/29110.6 unrealized/536 realized/28 dividend income. These are explicit fixtures, not live market data. No live provider runs in demo mode; idempotent seed rejects inconsistent data.

Walkthrough: Explore demo → Dashboard holdings-only value/coverage/current allocation/concentration → Holdings filter/search/sort → Asset exact quantity/cost/FX provenance → Transactions recorded IDs/signed flows/immutable detail → read-only Settings → logout. Record/Void/account writes and shared-identity privacy export are denied server-side. Refresh/logout and browser-local theme work. No fabricated history or substitute TWR/XIRR/performance/risk/attribution/News/AI.

Exercise manual BUY/SELL/DIVIDEND/SPLIT/review/FX override/void/export/delete with a normal local registered/verified account and owned default portfolio. Tests use that isolated flow, not the public demo. Missing provider rights/keys produce unavailable quotes/incomplete coverage; known subtotal is not a complete value.

Separate executable domain/demo/security/browser tests and [actual evidence](PHASE_3_EVIDENCE.md). [Visual pack](PHASE_3_VISUAL_REVIEW.md) requires user approval; new Light/mobile states are derived. Public HTTPS/proxy/cookies/Safari/email/backup/restore and selected free-tier compatibility remain NOT VERIFIED. No scheduler/public deployment/later-tier walkthrough/production-readiness claim.
