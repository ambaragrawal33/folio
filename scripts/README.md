# Folio tooling

verify-dependencies.mjs checks every installed package engine and peer edge against the resolved graph.

init-local-env.mjs generates missing local auth keys into ignored .env without printing or overwriting credentials. prepare-test-database.mjs downloads/starts/stops the pinned MongoDB 8.2.12 isolated replica set before bounded tests. Auth tests create/drop only random test databases.

infrastructure-smoke.mjs verifies real API/ready/proxy/Swagger/MailHog HTTP and SMTP. auth-infrastructure-smoke.mjs verifies shared Redis concurrency/TTL, actual CSRF/protected API behavior, 13 OpenAPI operations and Mongo indexes/email lookup. Browser E2E requires real Compose services.

Seed fixtures and job runners belong to the domain/provider phases. No portfolio seed, provider fixture, financial calculation or job exists yet.
