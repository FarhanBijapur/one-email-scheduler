# ONE - Email Job Scheduler

ONE is a full-stack email scheduler for the ReachInbox / Outbox Labs assessment. An authenticated user creates a batch for a future time; PostgreSQL persists its records, BullMQ keeps delayed jobs in Redis, and a separate worker claims, rate-limits, and sends each email through SMTP.

PostgreSQL is the source of truth. Elasticsearch is a best-effort search index, never an authority for delivery state.

## Architecture

```
React/Vite -> Express API -> PostgreSQL
                      |-> Redis/BullMQ -> worker -> SMTP
                      |-> Elasticsearch (best-effort index/search)
                      |-> Google OAuth, Slack OAuth, Bull Board
```

- `apps/api`: Express API, OAuth, session auth, email APIs, Elasticsearch search, and Bull Board.
- `apps/worker`: BullMQ consumer, atomic claims, Redis rate reservations, SMTP, and Slack notifications.
- `apps/web`: React/Vite/Tailwind ONE interface.
- `packages/shared`: configuration, queue factory/types, repositories, Elasticsearch, Slack, and logging.
- `prisma`: PostgreSQL schema and initial migration.
- `docker`: Redis AOF configuration.

There is no cron or in-process email timer. The queue is `email-send`; its deterministic BullMQ `jobId` is the persisted Email UUID.

## Prerequisites

- Node.js 20+ and npm 10+.
- Docker Desktop with Compose v2 for PostgreSQL, Redis, and Elasticsearch.
- Google OAuth credentials to sign in.
- Ethereal SMTP credentials to run the delivery worker.
- Slack credentials only when exercising Slack notifications.

## Configuration

Copy the root template for API and worker settings:

```powershell
Copy-Item .env.example .env
```

Copy `apps/web/.env.example` to `apps/web/.env` only for a non-default browser API origin. Do not commit either `.env` file.

| Group | Variables |
| --- | --- |
| Runtime | `NODE_ENV`, `API_HOST`, `API_PORT`, `WEB_URL` |
| PostgreSQL / Docker | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `DATABASE_URL` |
| Redis | `REDIS_PORT`, `REDIS_URL` |
| Elasticsearch | `ELASTICSEARCH_PORT`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_USERNAME`, `ELASTICSEARCH_PASSWORD` |
| Session | `SESSION_SECRET`, `SESSION_TTL_HOURS`, `OAUTH_STATE_TTL_SECONDS` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| Slack | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_OAUTH_AUTHORIZE_URL`, `SLACK_API_URL` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM` |
| Worker | `WORKER_CONCURRENCY` |
| Browser (`apps/web/.env`) | `VITE_API_URL` |

Elasticsearch username/password must be supplied together. Google and Slack client IDs/secrets must also be supplied together. Production requires explicit `DATABASE_URL`, `REDIS_URL`, `ELASTICSEARCH_URL`, and a long random `SESSION_SECRET`.

## Local Setup

```bash
npm install
npm run infra:up
npm run db:deploy
```

Docker Compose creates durable volumes for PostgreSQL, Redis, and Elasticsearch. Redis uses AOF (`appendfsync everysec`), so delayed jobs remain durable across API and worker restarts while the Redis volume is retained.

Start the three processes in separate terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

- Web: `http://localhost:5173`
- API health: `http://localhost:3001/health`
- Authenticated Bull Board: `http://localhost:3001/admin/queues`

Bull Board is read-only and monitors the same `email-send` queue used by the API and worker.

## Authentication and Integrations

Google OAuth is the only login mechanism. The API validates the ID-token issuer, audience, and verified email, consumes Redis-backed single-use OAuth state, and writes an opaque random session ID into an httpOnly, SameSite=Lax cookie. Sessions are persisted in PostgreSQL; the browser never receives OAuth or session tokens. Configure `GOOGLE_CALLBACK_URL` in Google (local default: `http://localhost:3001/auth/google/callback`).

Configure `SLACK_REDIRECT_URI` in a Slack app (local default: `http://localhost:3001/api/slack/callback`). The app requests `chat:write` only. Slack tokens stay server-side in PostgreSQL. An authenticated user can connect, inspect status, and disconnect from the UI. When an atomic Redis reservation actually skips a full hourly-cap window, the worker sends one best-effort App Home notification after the email row is rescheduled and its BullMQ job is delayed. A Redis NX key prevents duplicate messages for the same reschedule event.

## API Surface

All routes below except `/health`, Google start/callback, and Slack callback require the opaque application session where relevant.

- `GET /health`
- `GET /auth/google`, `GET /auth/google/callback`, `GET /auth/me`, `POST /auth/logout`
- `POST /api/email-batches`
- `GET /api/emails/scheduled`, `GET /api/emails/sent`, `GET /api/emails/counts`, `GET /api/emails/:id`
- `GET /api/emails/search`
- `GET /api/slack/connect`, `GET /api/slack/callback`, `GET /api/slack/status`, `POST /api/slack/disconnect`
- `GET /admin/queues` (authenticated Bull Board)

Batch creation validates recipients, subject/body, a future ISO-8601 `scheduledAt`, delay, and hourly limit. It creates EmailBatch and Email rows in one PostgreSQL transaction, indexes best-effort, then enqueues a delayed job for each committed email. Queue failure returns a 503 with persisted-batch context and does not roll back PostgreSQL.

## Delivery, Limits, and Search

The worker uses configurable `WORKER_CONCURRENCY`. Every job first atomically changes one scheduled Email to `PROCESSING` with a fresh claim token. Duplicate jobs, terminal emails, and concurrently claimed emails are safe no-ops.

The Redis Lua reservation atomically applies the per-user minimum gap and hourly cap. An email that cannot fit receives a new `plannedSendAt`, returns to `SCHEDULED`, and the same active BullMQ job moves to the delayed set. It is never marked sent or dropped for hitting the cap. Redis failure releases the claim and causes BullMQ retry rather than permitting an unlimited send.

SMTP uses a pooled, Ethereal-compatible Nodemailer transport. Transient failures release the guarded claim for exponential BullMQ retry; permanent failures become `FAILED`. A process failure after SMTP acceptance but before the database transition can cause a repeat delivery after recovery, so delivery is practical at-least-once, not exactly-once.

Email state changes are indexed into Elasticsearch best-effort. Search accepts controlled `q`, `status`, `page`, and `limit` values, always filters by the authenticated user, and returns a controlled 503 if Elasticsearch is unavailable. Elasticsearch failure never rolls back delivery state.

## Frontend and Limitations

The React UI uses components and CSS, not screenshots. It provides compose, recipient chips, future scheduling presets, scheduled/sent lists, search, email detail, Slack controls, count refreshes, and loading/error/empty states. Browser requests use `credentials: include`; there is no mock business data or client-side token storage.

Attachment upload is intentionally not implemented because no verified upload API contract exists. Selected files remain local and are never included in a batch request. CSV/text lead-list ingestion is also not implemented in the current API contract.

## Validation and Manual Demo

Run when the local Node environment permits:

```bash
npm run typecheck -w @one/api
npm run typecheck -w @one/worker
npm run typecheck -w @one/web
npm run build -w @one/api
npm run build -w @one/worker
npm run build -w @one/web
```

The current environment blocks Node before scripts begin with `EPERM: operation not permitted, lstat 'C:\\Users\\LENOVO'`; no successful local build or integration run is claimed.

Recommended evaluator flow:

1. Configure Google and Ethereal, start Docker infrastructure, apply the migration, then start API, worker, and web.
2. Sign in with Google and open Bull Board in the same authenticated browser session.
3. Compose a future batch with several recipients, a visible delay, and a small hourly limit.
4. Confirm scheduled rows and delayed jobs, stop/restart API and worker, and confirm jobs remain delayed.
5. Let the worker deliver through Ethereal; confirm the sent list and Elasticsearch search result.
6. Set a low hourly limit, connect Slack, and confirm rescheduled jobs plus one App Home notification per hourly-cap reschedule.
