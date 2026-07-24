# Backend Architecture

## Decision

Taxi Bgr starts as a modular monolith. The initial load does not justify
distributed transactions, a message broker or independently deployed services.
Module boundaries and durable events are introduced now so selected components
can be extracted later.

Reference projects:

- [Namma Yatri](https://github.com/nammayatri/nammayatri) for rider/driver
  boundaries, dedicated location tracking, dashboards and load tests;
- [NestJS](https://github.com/nestjs/nest) for framework and gateway patterns;
- [Node.js Docker](https://github.com/nodejs/docker-node) for runtime images.

No source code is copied from these projects.

## Data Ownership

- PostgreSQL is the source of truth for users, orders, money and status history.
- PostGIS owns tariff zones and point-in-zone queries.
- Redis stores short-lived location, presence, rate limits and distributed
  coordination data. Redis is never the only copy of financial data.
- Activity events feed operational and legal statistics.
- Outbox events allow reliable workers and future service extraction.

## Module Boundaries

- authentication, users and the single administrator role;
- driver verification;
- service zones and tariffs;
- orders and state transitions;
- driver availability and location;
- notifications and chat;
- commission and payments;
- surveys and analytics.

Modules communicate through public services and events, not by reaching into
each other's repositories.

Driver documents are private objects. Registration uploads are scoped to the
one-time registration token, and administrators receive short-lived signed
download URLs rather than public bucket access. Every verification decision is
stored in append-only review history and an activity event.

## Order Safety Rules

The orders stage must follow these rules:

1. Every state transition is validated by the server.
2. Accepting an order is atomic and protected by a database transaction.
3. Commands from mobile clients use idempotency keys.
4. Price and commission are stored as integer kopecks, never floating point.
5. Every price stores the tariff version and inputs used to calculate it.
6. WebSocket messages are notifications; clients resync authoritative state
   through HTTP after reconnecting.
7. Status history is append-only.
8. Background jobs use the outbox table and tolerate repeated delivery.

## Authentication Safety Rules

1. OTP values are stored in Redis only as keyed hashes with a short TTL.
2. OTP requests are rate-limited by phone number and IP address.
3. Registration tokens are short-lived and can be consumed only once.
4. Access tokens are short-lived JWTs and are accepted only while their
   database session remains active.
5. Refresh tokens are opaque, stored only as hashes and rotated on every use.
6. Driver access starts in `pending_verification` and requires manual approval.
7. Mock SMS is available only in local development and tests.

## Scale Path

Keep one deployable application until measurements show a bottleneck. The
first likely extraction candidates are:

1. location ingestion and passenger location streaming;
2. push notifications and scheduled jobs;
3. order board fan-out and allocation;
4. analytics export.

Multiple API instances can share PostgreSQL and Redis before any module is
split into a separate service.
