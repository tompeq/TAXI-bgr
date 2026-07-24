# Taxi Bgr Backend

NestJS backend for the Taxi Bgr passenger, driver and administration apps.

## Detailed Guide

The complete Russian-language walkthrough of the backend, including request
flows, security decisions, source files and line references, is available in
[`docs/backend-guide-ru.md`](docs/backend-guide-ru.md).

## Architecture

The MVP starts as a modular monolith:

- Fastify HTTP adapter;
- PostgreSQL 17 with PostGIS;
- Redis for short-lived state and future realtime scaling;
- MinIO for private driver documents in local development;
- TypeORM with explicit migrations and `synchronize: false`;
- activity events for product and legal statistics;
- transactional outbox table for future workers and service extraction.

Modules can later be separated into location tracking, notifications or order
allocation services without changing the public API contracts.

## Local Start

Requirements: Node.js 22+, npm and Docker Desktop.

```powershell
Copy-Item .env.example .env
npm install
npm run db:up
npm run migration:run
npm run start:dev
```

## Docker Start

For a full Docker-based launch, create and fill in `.env`, then run:

```powershell
npm run docker:up
```

The `migrate` service applies pending database migrations once. The `api`
service starts only after PostgreSQL, Redis and MinIO are ready, and is exposed
on `http://localhost:3000`. To view the API logs:

```powershell
npm run docker:logs
```

The mobile app must use the computer's LAN address, for example
`http://YOUR_COMPUTER_IP:3000/api/v1`, rather than `localhost`.

## Temporary Server Deployment Without A Domain

The production compose file is separate from the local development compose file.
It publishes only the API and admin interface; PostgreSQL, Redis and MinIO stay
inside the Docker network.

On the server, copy `.env.production.example` to `.env.production`, replace
`SERVER_IP` and every `replace-with-...` value, then run:

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --build --pull always
```

The API is available at `http://SERVER_IP:3000`, and the admin interface at
`http://SERVER_IP:8080`. The Flutter build must use
`http://SERVER_IP:3000/api/v1` as `API_BASE_URL`.

Do not copy the local `.env` file to a public repository or image. Keep the
production file only on the server with restrictive permissions:

```bash
chmod 600 .env.production
```

After rebuilding an image, verify that it contains no fixable critical or high
vulnerabilities:

```powershell
npm run docker:scan
```

Endpoints:

- API health: `http://localhost:3000/api/v1/health`
- Swagger: `http://localhost:3000/docs`
- MinIO console: `http://localhost:9001`

Create an administrator account explicitly:

```powershell
npm run admin:create -- +79990000000 "Администратор"
```

Administrator accounts cannot self-register. The web interface lives in the
sibling `admin` project and uses the same SMS login flow.

## Authentication

The first backend stage includes:

- SMS OTP request and verification;
- passenger registration;
- driver registration with `pending_verification` access state;
- short-lived JWT access tokens;
- rotating, server-revocable refresh sessions;
- logout and authenticated profile retrieval.

In local development `SMS_MODE=mock` returns `debugCode` from
`POST /api/v1/auth/otp/request` and also writes the code to the server log.
Set `SMS_MODE=smspilot` with `SMSPILOT_API_KEY` to deliver real codes through
SMSPILOT. Leave `SMSPILOT_SENDER` empty to use its shared sender without a
monthly branded-sender fee. Production validation rejects mock SMS mode and
requires the provider key when SMSPILOT is selected. Production startup also
requires explicit `DB_PASSWORD`,
`OTP_HASH_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REGISTRATION_SECRET`,
`S3_ACCESS_KEY` and `S3_SECRET_KEY` values; local defaults are never accepted
implicitly.

Use Swagger for the complete request schemas. The main flow is:

1. `POST /api/v1/auth/otp/request`
2. `POST /api/v1/auth/otp/verify`
3. register with the one-time `registrationToken`, or receive a session for an
   existing account
4. call protected endpoints with `Authorization: Bearer <accessToken>`
5. rotate the session through `POST /api/v1/auth/refresh`

## Checks

```powershell
npm run format:check
npm run lint
npm test -- --runInBand
npm run test:e2e
npm run audit
```

The e2e tests require the PostgreSQL, Redis and MinIO containers to be running
and all migrations to be applied.

## Database

Never enable TypeORM schema synchronization. Create and review a migration for
every schema change.

```powershell
npm run migration:show
npm run migration:run
npm run migration:revert
```

The initial migration creates:

- users and driver verification profiles;
- revocable authentication sessions;
- PostGIS service zones;
- activity events for analytics;
- outbox events for reliable asynchronous processing.

Later migrations add revocable authentication sessions, a single `admin` role,
driver review history, the `changes_requested` verification state, orders,
status history, editable tariff settings, driver shifts, work settings, device
registrations, surveys and road-condition state.

## Orders And Tariffs

The first order vertical slice includes:

- passenger fare quotes and order creation;
- server-side zone, time-period and round-trip pricing;
- separate taxi and delivery prices editable by an administrator;
- an open order board for approved drivers;
- atomic order acceptance with one active order per driver;
- validated driver status transitions and cancellation history;
- activity and outbox events for every important change.

The Flutter app uses `POST /api/v1/orders/quote` before submission, so an
administrator's new price is shown to passengers without rebuilding the app.
An order stores both its final fare and the tariff version used at creation;
later tariff changes do not alter existing orders.

## Driver Work

Approved drivers now have a server-owned work state:

- start and end a shift;
- take a 10, 30 or 60 minute break and resume early;
- restore the active shift after restarting the mobile app;
- enable taxi and/or delivery orders;
- store background and night notification preferences;
- see completed-order earnings for the latest 24 hours.

Only online drivers can open the board or accept an order. A driver cannot take
a break or end a shift while an order is active. When at least two approved
drivers are online, a driver whose 24-hour earnings are at least 20 percent
above the online average sees new orders after a 25-second delay.

## Automation, Surveys And Push

The administrator can edit accepted-order timeout, free waiting time, waiting
price, arrival notification threshold, survey texts and intervals, road vote
thresholds and surcharge percentage. A scheduled worker returns accepted
orders to the board when the driver does not start moving in time. Waiting is
charged only for complete minutes after the free period.

Driver price and road survey responses are stored separately. Road surcharge
state is calculated from the editable vote thresholds and can also be
overridden manually in the admin interface. The surcharge is currently applied
to daytime quotes only.

Push uses FCM HTTP v1. Without `FCM_SERVICE_ACCOUNT_BASE64` the worker remains
disabled and keeps relevant outbox events unpublished. To configure it, encode
the Firebase service account JSON as one Base64 string and put that value in
`.env`; never commit the JSON or the encoded secret.

## Driver Documents

Registration images are uploaded through
`POST /api/v1/auth/registration/images/:kind`. The registration token binds
every object to one verified phone flow. The API accepts JPEG, PNG and WebP
files up to 8 MB and validates that all five driver images exist before
creating the account.

Admin document links are signed and expire after ten minutes. The MinIO bucket
is private. Unfinished registration uploads that are not linked to a passenger
or driver profile are deleted daily after `REGISTRATION_UPLOAD_RETENTION_HOURS`
(24 hours by default).
