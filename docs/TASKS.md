# Tasks

## Locked Requirements

- **Product:** Data feed API + real-time odds updates
- **Audience:** Bookmakers + bettors
- **SLA:** Best-effort
- **Scope:** Multi-sport
- **Concurrency:** ~300 concurrent WebSocket users
- **Rate:** Max 1 update/sec per game
- **Replay window:** 1 hour

## Task List

### In progress

- **[h35] Export current premium-readiness task list to a Markdown file in the repo (TASKS.md).**
  - Priority: medium
  - Status: in_progress

### Pending (high)

- **[h33] Reverse engineer Swarm protocol for real-time odds (inspect sportsbook WS frames) to find subscribe/unsubscribe commands, if any.**
  - Priority: high
  - Status: pending

- **[h34] If no push protocol exists: design consolidated polling for subscribed gameIds (batch @in queries) + diff + throttle, publish to Redis Streams (1h replay).**
  - Priority: high
  - Status: pending

- **[h28] Design and implement real-time odds change pipeline: ingestion worker -> normalize -> Redis Streams/PubSub -> WS delivery with subscription model.**
  - Priority: high
  - Status: pending

- **[h29] Add odds snapshots/history storage + replay endpoints (changes since cursor, snapshot at time).**
  - Priority: high
  - Status: pending

- **[h21] Premium readiness: add authentication (API keys/JWT), authorization, and per-key rate limiting/quotas.**
  - Priority: high
  - Status: pending

- **[h22] Premium readiness: add API versioning + OpenAPI/Swagger docs + SDK examples and a stable contract.**
  - Priority: high
  - Status: pending

- **[h23] Premium readiness: improve reliability (worker separation, retries/backoff, monitoring/alerting, Redis persistence).**
  - Priority: high
  - Status: pending

- **[h24] Premium readiness: production security/compliance (secrets management, audit logs, ToS/license review for data sources/widget).**
  - Priority: high
  - Status: pending

- **[h26] Define commercial offering for bookmakers vs bettors (features, endpoints, SLAs, pricing tiers).**
  - Priority: high
  - Status: pending

### Pending (medium)

- **[h25] Premium readiness: monetization plumbing (billing, usage metering, plans, admin dashboard).**
  - Priority: medium
  - Status: pending
