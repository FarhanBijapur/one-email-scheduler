# ONE — Email Job Scheduler

ONE is a production-oriented full-stack email scheduling platform built for the ReachInbox / Outbox Labs Software Development Engineer Internship assessment.

The application allows authenticated users to create email batches, schedule delivery, enforce per-user rate limits, persist jobs across application restarts, search email records, and monitor BullMQ jobs through Bull Board.

The system uses PostgreSQL as the source of truth, Redis/BullMQ for durable job scheduling, a dedicated worker for delivery, SMTP for email delivery, and Elasticsearch as a best-effort search index.

---

## Features

- Google OAuth authentication
- PostgreSQL-backed sessions
- Email batch creation and scheduling
- BullMQ delayed jobs
- Dedicated background worker
- Configurable worker concurrency
- Atomic email claiming
- Idempotent job handling
- Per-user minimum delay between emails
- Per-user hourly sending limit
- Automatic rescheduling when the hourly limit is reached
- Redis-backed distributed rate limiting
- Ethereal SMTP email delivery
- Elasticsearch email indexing and search
- Bull Board queue monitoring
- Slack OAuth integration
- Slack notifications when emails are rescheduled because of the hourly limit
- Scheduled and sent email views
- Search and filtering
- Responsive React/Tailwind interface
- Persistent PostgreSQL state
- Docker-based local infrastructure

---

# Architecture

```text
                         ┌─────────────────────┐
                         │     React / Vite     │
                         │   Tailwind / TS     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Express API      │
                         │      TypeScript     │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
      ┌──────────────┐      ┌──────────────┐      ┌───────────────┐
      │ PostgreSQL   │      │ Redis/BullMQ │      │ Elasticsearch │
      │ Source of    │      │ Job Queue +  │      │ Search Index  │
      │ Truth        │      │ Rate Limits  │      │               │
      └──────────────┘      └──────┬───────┘      └───────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Dedicated       │
                          │ Worker          │
                          │ TypeScript      │
                          └────────┬────────┘
                                   │
                         ┌─────────┴─────────┐
                         ▼                   ▼
                  ┌─────────────┐     ┌─────────────┐
                  │ SMTP /      │     │ Slack API   │
                  │ Ethereal    │     │             │
                  └─────────────┘     └─────────────┘
````

### Monorepo Structure

```text
one-email-scheduler/
│
├── apps/
│   ├── api/
│   │   └── Express API
│   │
│   ├── worker/
│   │   └── BullMQ email worker
│   │
│   └── web/
│       └── React/Vite frontend
│
├── packages/
│   └── shared/
│       └── Shared configuration, repositories,
│           queue utilities, Elasticsearch,
│           Slack integration and logging
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── docker/
│   └── Redis configuration
│
├── docs/
│
├── docker-compose.yml
├── package.json
└── README.md
```

### Application Responsibilities

#### `apps/api`

Responsible for:

* Express API
* Google OAuth
* Session authentication
* Email batch APIs
* PostgreSQL persistence
* BullMQ job creation
* Elasticsearch indexing/search
* Slack OAuth
* Bull Board

#### `apps/worker`

Responsible for:

* BullMQ job consumption
* Atomic email claiming
* Redis rate-limit reservations
* Minimum inter-email delay
* Hourly sending limits
* Email rescheduling
* SMTP delivery
* Retry handling
* Slack notifications

#### `apps/web`

Responsible for:

* React UI
* Email composer
* Scheduling controls
* Scheduled email list
* Sent email list
* Search
* Email details
* Slack controls
* Authentication UI

#### `packages/shared`

Contains shared:

* Configuration
* Queue definitions
* Repository logic
* Elasticsearch services
* Slack services
* Logging utilities
* Shared types

---

# Core Design Decisions

## PostgreSQL is the Source of Truth

PostgreSQL owns the authoritative email state.

Elasticsearch is only a search index and is never used to determine whether an email should be delivered.

```text
PostgreSQL
    │
    ├── SCHEDULED
    ├── PROCESSING
    ├── SENT
    └── FAILED
```

Elasticsearch failures therefore do not change or roll back delivery state.

---

## BullMQ Delayed Jobs

The queue name is:

```text
email-send
```

Each persisted Email receives one deterministic BullMQ `jobId` based on its Email UUID.

There is no cron job and no in-process email timer.

Scheduling is handled by BullMQ delayed jobs backed by Redis.

---

## Atomic Email Claiming

Before sending an email, the worker atomically changes:

```text
SCHEDULED → PROCESSING
```

and creates a claim token.

This prevents multiple workers from processing the same email concurrently.

Duplicate jobs, already-processed emails, and concurrently claimed emails become safe no-ops.

---

## Rate Limiting

Redis is used for distributed rate limiting.

The worker atomically reserves the next valid sending slot while enforcing:

1. Minimum delay between emails
2. Per-user hourly sending limit

If an email cannot be sent during the current hour, it is not dropped.

Instead:

```text
SCHEDULED
    ↓
Rate limit reached
    ↓
New plannedSendAt
    ↓
BullMQ delayed job
    ↓
SCHEDULED
    ↓
Worker retries later
```

No cron scheduler is required.

---

## Delivery Semantics

SMTP delivery cannot provide mathematical exactly-once semantics across every possible process crash.

For example:

```text
SMTP accepts email
        ↓
Process crashes
        ↓
Database still says PROCESSING
```

After recovery, a retry can potentially cause another delivery.

Therefore the system provides **practical at-least-once delivery semantics** with guarded database state transitions and deterministic jobs.

This limitation is explicitly documented rather than claiming impossible exactly-once SMTP delivery.

---

# Prerequisites

Install:

* Node.js 20+
* npm 10+
* Docker Desktop
* Docker Compose v2

You also need:

* Google OAuth credentials
* Ethereal SMTP credentials
* Slack OAuth credentials for Slack notification testing

---

# Configuration

Copy the root environment template:

```powershell
Copy-Item .env.example .env
```

For the frontend, copy:

```powershell
Copy-Item apps/web/.env.example apps/web/.env
```

Do not commit `.env` files.

## Environment Variables

| Group         | Variables                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Runtime       | `NODE_ENV`, `API_HOST`, `API_PORT`, `WEB_URL`                                                                          |
| PostgreSQL    | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `DATABASE_URL`                                   |
| Redis         | `REDIS_PORT`, `REDIS_URL`                                                                                              |
| Elasticsearch | `ELASTICSEARCH_PORT`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_USERNAME`, `ELASTICSEARCH_PASSWORD`, `ELASTICSEARCH_API_KEY` |
| Session       | `SESSION_SECRET`, `SESSION_TTL_HOURS`, `OAUTH_STATE_TTL_SECONDS`                                                       |
| Google        | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`                                                      |
| Slack         | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_REDIRECT_URI`, `SLACK_OAUTH_AUTHORIZE_URL`, `SLACK_API_URL`           |
| SMTP          | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, `SMTP_FROM`                                     |
| Worker        | `WORKER_CONCURRENCY`                                                                                                   |
| Frontend      | `VITE_API_URL`                                                                                                         |

### Production Configuration

Production requires explicit:

```text
DATABASE_URL
REDIS_URL
ELASTICSEARCH_URL
SESSION_SECRET
```

`SESSION_SECRET` should be a long cryptographically random value.

When using Elasticsearch API-key authentication, configure:

```text
ELASTICSEARCH_URL
ELASTICSEARCH_API_KEY
```

---

# Local Setup

Install dependencies:

```bash
npm install
```

Start infrastructure:

```bash
npm run infra:up
```

Apply the database migration:

```bash
npm run db:deploy
```

Start the API:

```bash
npm run dev:api
```

Start the worker in a second terminal:

```bash
npm run dev:worker
```

Start the frontend in a third terminal:

```bash
npm run dev:web
```

## Local URLs

Frontend:

```text
http://localhost:5173
```

API:

```text
http://localhost:3001
```

Health check:

```text
http://localhost:3001/health
```

Bull Board:

```text
http://localhost:3001/admin/queues
```

Bull Board uses the same `email-send` queue consumed by the worker.

---

# Authentication

Google OAuth is the only authentication mechanism.

The API:

* Validates the OAuth issuer
* Validates the audience
* Requires a verified Google email
* Uses Redis-backed single-use OAuth state
* Creates an opaque random session ID
* Stores sessions in PostgreSQL
* Uses an httpOnly session cookie

OAuth tokens are never stored in browser local storage.

The browser does not receive the Google OAuth credential as an application session token.

For local development, configure:

```text
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
```

and add the same callback URL to the Google OAuth configuration.

---

# Slack Integration

Slack uses server-side OAuth.

The application requests:

```text
chat:write
```

Slack tokens remain server-side.

Configure:

```text
SLACK_REDIRECT_URI=http://localhost:3001/api/slack/callback
```

The UI allows an authenticated user to:

* Connect Slack
* View connection status
* Disconnect Slack

When an email is genuinely rescheduled because the hourly sending limit is full, the worker sends a Slack notification.

A Redis `NX` key prevents duplicate notifications for the same rescheduling event.

---

# API

## Health

```http
GET /health
```

## Authentication

```http
GET  /auth/google
GET  /auth/google/callback
GET  /auth/me
POST /auth/logout
```

## Email APIs

```http
POST /api/email-batches

GET /api/emails/scheduled
GET /api/emails/sent
GET /api/emails/counts
GET /api/emails/:id

GET /api/emails/search
```

## Slack

```http
GET  /api/slack/connect
GET  /api/slack/callback
GET  /api/slack/status
POST /api/slack/disconnect
```

## Bull Board

```http
GET /admin/queues
```

Authenticated access is required where applicable.

---

# Email Batch Creation

Batch creation validates:

* Recipients
* Subject
* Body
* Future `scheduledAt`
* Minimum delay
* Hourly limit

EmailBatch and Email rows are created in a single PostgreSQL transaction.

After the database transaction commits:

1. Email records are indexed into Elasticsearch on a best-effort basis.
2. BullMQ jobs are created for the committed emails.
3. Each job uses the Email UUID as its deterministic job ID.

If queue submission fails after database commit, the API returns an appropriate error while preserving the committed PostgreSQL records.

The database is never rolled back based solely on an Elasticsearch failure.

---

# Elasticsearch Search

Elasticsearch is used as a search layer.

Search supports controlled parameters including:

```text
q
status
page
limit
```

Every search is filtered by the authenticated user's ID.

The system searches relevant email fields such as:

* Subject
* Body
* Recipient
* Sender

Elasticsearch is never treated as the delivery source of truth.

If Elasticsearch is unavailable, the search endpoint returns a controlled `503` rather than silently falling back to PostgreSQL.

---

# Frontend

The frontend is implemented using:

* React
* TypeScript
* Vite
* Tailwind CSS

The UI provides:

* Google authentication
* Email composer
* Recipient chips
* Send Now
* Schedule Later
* Scheduling presets
* Scheduled email list
* Sent email list
* Search
* Email details
* Slack connection controls
* Counts
* Loading states
* Empty states
* Error states
* Responsive layout

The interface is implemented with React components and CSS rather than screenshots.

Browser API requests use:

```text
credentials: include
```

No mock business data or client-side authentication tokens are used.

---

# Attachments and Recipient Files

Attachment upload is currently not implemented because the provided API contract does not define a verified backend upload/storage flow.

Selected files remain local to the browser and are not included in the email batch API request.

CSV/text recipient-list ingestion is also not implemented in the current API contract.

These are documented limitations rather than simulated features.

---

# Validation

The project includes TypeScript and production build scripts.

Run:

```bash
npm run typecheck -w @one/api
npm run typecheck -w @one/worker
npm run typecheck -w @one/web
```

Build:

```bash
npm run build -w @one/api
npm run build -w @one/worker
npm run build -w @one/web
```

---

# End-to-End Demo

A recommended local demonstration flow is:

### 1. Start infrastructure

```bash
npm run infra:up
npm run db:deploy
```

### 2. Start API, worker and frontend

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

### 3. Authenticate

Open:

```text
http://localhost:5173
```

Sign in using Google OAuth.

### 4. Send an email

Create an email using Ethereal SMTP.

Verify that the email transitions through:

```text
SCHEDULED
    ↓
PROCESSING
    ↓
SENT
```

### 5. Schedule an email

Create a future email batch.

Open Bull Board:

```text
http://localhost:3001/admin/queues
```

Show the delayed BullMQ job.

### 6. Restart persistence test

Restart the API and worker while delayed jobs exist.

Verify that the PostgreSQL state and Redis-backed delayed jobs remain available.

### 7. Search

Use the search interface to find an indexed email through Elasticsearch.

### 8. Rate-limit test

Configure a small hourly limit.

Create multiple emails and demonstrate that emails exceeding the current hourly capacity are rescheduled rather than dropped.

### 9. Slack test

Connect Slack and demonstrate the notification generated when an email is actually rescheduled because of the hourly limit.

---

# Production Deployment

The application is also deployed using:

* Vercel — frontend
* Render — API
* Render — worker service
* Neon — PostgreSQL
* Render Redis — Redis/BullMQ
* Elastic Cloud — Elasticsearch

Live application:

**[https://one-email-scheduler.vercel.app](https://one-email-scheduler.vercel.app)**

API:

**[https://one-email-scheduler-api.onrender.com](https://one-email-scheduler-api.onrender.com)**

Worker:

**[https://one-email-scheduler-worker.onrender.com](https://one-email-scheduler-worker.onrender.com)**

The repository contains the deployment configuration and production environment structure.

---

# Production Deployment Note

The local environment provides the complete end-to-end demonstration environment with Docker-backed PostgreSQL, Redis and Elasticsearch.

The submitted production deployment is provided as an additional live environment. Because the worker is hosted on a constrained deployment configuration, some background-worker behavior may differ from the local environment.

The source code, architecture and local end-to-end implementation remain available in the repository for evaluation.

---

# Known Limitations

The current implementation has the following documented limitations:

* Attachment upload/storage is not implemented.
* CSV/text lead-list ingestion is not implemented.
* SMTP delivery provides practical at-least-once semantics rather than mathematical exactly-once semantics.
* Elasticsearch is a best-effort search index and is not the delivery source of truth.
* Production worker behavior depends on the hosting environment and its available background-worker resources.
* Automated integration-test coverage is limited; the primary validation flow is currently manual/local end-to-end testing.

---

# Project Status

| Component                        | Status          |
| -------------------------------- | --------------- |
| React frontend                   | Complete        |
| Express API                      | Complete        |
| PostgreSQL persistence           | Complete        |
| Google OAuth                     | Complete        |
| Session authentication           | Complete        |
| BullMQ scheduling                | Complete        |
| Dedicated worker                 | Complete        |
| Redis rate limiting              | Complete        |
| Hourly rescheduling              | Complete        |
| SMTP/Ethereal delivery           | Complete        |
| Elasticsearch search             | Complete        |
| Bull Board                       | Complete        |
| Slack OAuth                      | Complete        |
| Slack hourly-limit notifications | Complete        |
| Docker local infrastructure      | Complete        |
| Attachment upload                | Not implemented |
| CSV/text recipient ingestion     | Not implemented |

---

# Repository

GitHub:

[https://github.com/FarhanBijapur/one-email-scheduler](https://github.com/FarhanBijapur/one-email-scheduler)

---

# Assessment

Built for the **ReachInbox / Outbox Labs Software Development Engineer Internship assessment**.

The implementation focuses on persistent scheduling, worker-based delivery, concurrency safety, distributed rate limiting, OAuth authentication, search, observability and a production-oriented architecture.
