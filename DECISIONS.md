# Decisions

## What I assumed

- **ACME-431 (Activity CSV)**: Assumed date pickers pass `YYYY-MM-DD` strings. When filtering by `to = YYYY-MM-DD`, operators expect all events generated on that date up to `23:59:59.999Z` to be included rather than truncating at midnight (`00:00:00.000Z`).
- **ACME-455 (Dashboard Performance)**: Dana was on leave, so I assumed the payload structure of `GET /api/dashboard` must remain identical while reducing response latency to sub-second speeds.

## What I changed

- **ACME-431**: Fixed non-deterministic offset pagination by appending `e.id DESC` as a primary key tie-breaker in `api/routes/exports.ts`. Normalized `to` date strings to end-of-day timestamps (`23:59:59.999Z`). Added an automated Vitest integration test (`api/tests/exports.test.ts`) asserting zero duplicate row IDs.
- **ACME-455**: Refactored the dashboard handler in `api/routes/dashboard.ts` from an N+1 query loop (601 sequential SQL queries) into a single aggregated SQL query with `LEFT JOIN` and `GROUP BY` subqueries. Reduced API latency from ~27.8s to ~410ms (>98.5% speedup). Added an integration test (`api/tests/dashboard.test.ts`) asserting response times stay under 1.5s.

## What I deliberately did not do

- **Did not rewrite offset pagination into keyset/cursor pagination for exports**: Keyset pagination (`WHERE (created_at, id) < ($1, $2)`) is faster for deep pages, but required changing the API interface contract. Adding `e.id DESC` to the existing offset query fixed the instability bug safely without breaking contract compatibility.
- **Did not implement caching or Redis for dashboard**: The SQL aggregation query cut response time down to 400ms cleanly in Postgres. Adding Redis or background worker caching would add unnecessary infrastructure complexity.

## Trade-offs

- **Subquery aggregation vs Materialized View for Dashboard**: Subqueries calculate stats on the fly per request. As `audit_events` grows into tens of millions, a materialized view or trigger-based rollups would be faster, but subqueries give 100% real-time accuracy today without schema migration overhead.

## What I would do next

1. **Add Database Composite Index**: Add an index on `audit_events(org_id, created_at DESC, id DESC)` to accelerate the subqueries and exports further.
2. **Implement Keyset Cursor Pagination**: Upgrade the activity export endpoint to cursor-based streaming for ultra-large tenants.
3. **Pick up ACME-412 (Bulk Member Invitations)**: Build the bulk email invitation UI modal and API handler.

## Where I used AI

- **Used AI Assistant**: Used Antigravity AI pair programmer for environment setup, database verification, running performance benchmarks, writing Vitest integration tests, and drafting documentation.
- **Where I overruled AI**: Directed the tool to keep the existing offset pagination structure for ACME-431 rather than refactoring to cursor pagination, avoiding unnecessary API contract changes.

## Anything broken or unfinished

- None. Both selected tickets (ACME-431 and ACME-455) are fully fixed, tested, and passing all 28 automated integration tests.
