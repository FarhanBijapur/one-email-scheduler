# Architecture

**Status:** Design only. No application code yet.

Product UI name in Figma: **ONE**. Backend remains a ReachInbox-style email job scheduler.

---

## 1. High-level system

```
Browser (React + TS + Tailwind)
        |  cookie session (httpOnly)
        v
Express API (TypeScript)
        |-- PostgreSQL   (source of truth)
        |-- Redis        (BullMQ + distributed locks/rate limits)
        |-- Elasticsearch (search index, best-effort)
        |-- Google OAuth
        |-- Slack OAuth + chat.postMessage
        |-- Bull Board UI
        v
BullMQ delayed jobs
        v
Worker process (TypeScript, configurable concurrency)
        |-- claim email row in PostgreSQL
        |-- Redis delay + hourly window
        |-- Email Delivery (Resend HTTPS or Ethereal SMTP)
        |-- update PostgreSQL
        |-- index Elasticsearch
        |-- Slack notify on hourly cap (non-fatal)
```

**Processes (three):**

1. `api` — HTTP, OAuth, enqueue jobs, search, dashboard APIs  
2. `worker` — consume BullMQ, send mail, reschedule, notify  
3. `web` — Vite React SPA  

Infrastructure via Docker Compose: PostgreSQL, Redis, Elasticsearch.

Forbidden: cron, node-cron, Agenda, in-memory schedulers.

---

## 2. Proposed repository layout

```
apps/
  api/                 Express app, routes, OAuth, Bull Board
  worker/              BullMQ worker entrypoint
  web/                 React + Vite + Tailwind
packages/              optional shared types/validation later
docs/                  this folder + figma screenshots
docker-compose.yml
.env.example
README.md
```

API internals (no giant files):

```
apps/api/src/
  routes/
  controllers/
  services/
  repositories/
  middleware/          session, errors, validate
  jobs/                queue names, job payloads
  lib/                 redis, db, es, mailer, slack, logger
```

---

## 3. Data flow — schedule a batch

1. Authenticated user submits compose (recipients, subject, HTML body, attachments metadata, `delaySeconds`, `hourlyLimit`, `scheduledAt`).
2. API validates (emails, future time, limits, CSV parse, attachment policy).
3. Transaction:
   - insert `email_batches`
   - insert `emails` (one per unique recipient), status `scheduled`
   - insert `email_attachments` if any
4. For each email, add a BullMQ job with:
   - `jobId` = email UUID (idempotent add)
   - `delay` = `max(0, scheduledAt + (index * delaySeconds) - now)`
5. Commit. Return batch + counts.
6. Worker later: claim → rate-limit check → SMTP → persist `sent` → ES index.

If hourly cap blocks send: do not mark sent; `moveToDelayed` / new delay; status stays `scheduled` (or `throttled` if we add that as a UI-visible scheduled substate). Slack notify once per window/batch as specified in services.

---

## 4. Database schema (PostgreSQL)

UUIDs as primary keys. Timestamps `timestamptz`.

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| google_sub | text UNIQUE NOT NULL | Google subject |
| email | text NOT NULL | |
| name | text | |
| avatar_url | text | |
| created_at / updated_at | timestamptz | |

### `sessions`

| Column | Type | Notes |
| --- | --- | --- |
| id | text PK | session id in httpOnly cookie |
| user_id | uuid FK | |
| expires_at | timestamptz | |
| created_at | timestamptz | |

### `slack_connections`

| Column | Type | Notes |
| --- | --- | --- |
| user_id | uuid PK FK | one connection per user |
| team_id | text | |
| team_name | text | |
| slack_user_id | text | |
| access_token | text | server-only; never in API JSON |
| incoming_webhook_url | text NULL | if granted |
| default_channel_id | text NULL | |
| connected_at | timestamptz | |

### `email_batches`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| user_id | uuid FK NOT NULL | |
| from_address | text NOT NULL | selected sender |
| from_name | text | |
| subject | text NOT NULL | |
| body_html | text NOT NULL | |
| body_text | text | generated/plain |
| delay_seconds | int NOT NULL DEFAULT 0 | min gap between sends |
| hourly_limit | int NOT NULL | > 0 |
| scheduled_at | timestamptz NOT NULL | batch start |
| recipient_count | int NOT NULL | |
| created_at | timestamptz | |

Indexes: `(user_id, created_at DESC)`.

### `emails`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | **BullMQ jobId** |
| batch_id | uuid FK | |
| user_id | uuid FK | denormalized for authz |
| to_address | text NOT NULL | |
| to_name | text NULL | |
| status | text NOT NULL | see state machine |
| sequence_index | int NOT NULL | order in batch (0..n-1) |
| planned_send_at | timestamptz NOT NULL | current planned time |
| claimed_at | timestamptz NULL | |
| claimed_by | text NULL | worker id |
| sent_at | timestamptz NULL | |
| failed_at | timestamptz NULL | |
| error_message | text NULL | |
| smtp_message_id | text NULL | |
| ethereal_preview_url | text NULL | demo |
| starred | boolean DEFAULT false | |
| created_at / updated_at | timestamptz | |

Constraints:

- `UNIQUE (id)` already PK; BullMQ jobId = `emails.id`
- Optional `UNIQUE (batch_id, to_address)` to block duplicate recipients in a batch
- Check: `status IN ('scheduled','sending','sent','failed','cancelled')`
- Partial unique: at most one in-flight claim — enforced by conditional `UPDATE`

Indexes:

- `(user_id, status, planned_send_at)`
- `(batch_id, sequence_index)`
- `(user_id, starred)` if needed

### `email_attachments`

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid PK | |
| email_id or batch_id | uuid FK | attachments shared on batch, copied at send |
| filename | text | |
| mime_type | text | |
| size_bytes | int | |
| storage_path | text | local disk / object path, not in git |

### `email_events` (optional audit)

| Column | Type | Notes |
| --- | --- | --- |
| id | bigserial | |
| email_id | uuid | |
| type | text | enqueued, claimed, throttled, sent, slack_notified |
| payload | jsonb | |
| created_at | timestamptz | |

---

## 5. Email status machine

```
scheduled  --claim-->  sending  --smtp ok-->  sent
                          |
                          +--smtp fail-->  failed  (retry may return to scheduled/sending per policy)
                          +--hourly/delay--> scheduled (planned_send_at updated; job delayed)
cancelled  (terminal; job removed if still delayed)
```

Rules:

- Only `scheduled` can be claimed.
- Claim is a single SQL statement: set `sending` + `claimed_at` **only if** `status = 'scheduled'`.
- If claim updates 0 rows → another worker owns it or already sent → **do not SMTP**.
- `sent` is terminal for send path. Job completion is recorded after DB write.
- `throttled` is **not** a separate durable status unless UI needs it; remaining mail stays `scheduled` with a later `planned_send_at` so the Scheduled list stays honest.

---

## 6. Queue / worker architecture

**Queue name:** `email-send`

**Job payload:** `{ emailId, batchId, userId }` (IDs only; body loaded from DB)

**Job options:**

- `jobId: email.id`
- `delay: planned_send_at - now`
- `attempts`: limited (e.g. 5) with exponential backoff **only for infrastructure failures**, not for “already sent”
- `removeOnComplete`: keep some history for Bull Board demo
- Redis connection: same persistent instance as docker volume

**Worker:**

- Separate Node process
- `concurrency = Number(process.env.WORKER_CONCURRENCY)`
- On process: load email → claim → rate limits → send → persist → ES
- On throttle: `job.moveToDelayed(nextMillis)` (or remove+add with same jobId), update `planned_send_at`
- Redis `maxRetriesPerRequest: null` as required by BullMQ

**Persistence:**

- Redis `appendonly yes` + Docker volume
- Do not use BullMQ in-memory
- API crash does not delete delayed set

**Bull Board:** mount at `/admin/queues` on API (demo: localhost). Document that it is for local review.

---

## 7. Rate-limiting strategy

Two distributed limits, **both in Redis**, keyed by `userId` (tenant/sender). Batch-level settings (`delay_seconds`, `hourly_limit`) are stored on `email_batches` and read by the worker.

### 7.1 Minimum delay between emails

- Key: `rl:gap:{userId}`  
- Value: Unix ms of last **successful send** (or last **reserved** send slot)  
- Operation: Lua or `SET` with compare:
  - `now >= last + delaySeconds * 1000` → reserve `now`, proceed
  - else → delay job by remaining ms
- Reservation happens **after** DB claim or as part of a “slot lock” so two workers cannot both pass the gap.

Alternative that preserves batch order better: compute `planned_send_at = scheduled_at + sequence_index * delay` at enqueue time, and still enforce Redis gap as a safety net for retries/throttles.

**Chosen combination:**

1. At enqueue, stagger `planned_send_at` by `sequence_index * delay_seconds`.
2. At send time, Redis lock `rl:gap:{userId}` enforces actual spacing under concurrency and reschedules.

### 7.2 Hourly cap

- Key: `rl:hour:{userId}:{yyyy-mm-dd-HH}` in UTC (or user TZ documented as UTC for the assessment)
- Redis `INCR` + `EXPIRE` 2 hours
- Before SMTP, if `count >= hourly_limit`:
  - do not INCR
  - compute `nextWindowStart`
  - optionally add `sequence_index * delay` inside that window so order holds
  - delay job; keep status `scheduled`
  - Slack: `SETNX rl:hour-notified:{userId}:{window}` so one notification per window

**Not used:** Node counters, module-level variables, single-process Maps.

---

## 8. Idempotency strategy

| Layer | Mechanism |
| --- | --- |
| Job identity | BullMQ `jobId = emails.id` → duplicate enqueue is rejected/ignored |
| Recipient | unique `(batch_id, to_address)` |
| Claim | `UPDATE emails SET status='sending', claimed_at=now() WHERE id=$1 AND status='scheduled'` |
| After send | `status='sent'` + `smtp_message_id`; retries see non-scheduled and skip SMTP |
| Redis | optional `SET send:{emailId} NX` as extra fence |
| SMTP gap | If process dies after SMTP success but before DB `sent`, a retry **could** send twice. Mitigate: short claim timeout + treat `sending` with recent `claimed_at` as in-flight; if claim is stale, inspect carefully. Document: **at-least-once to SMTP**, **exactly-once not possible** without a transactional outbox with the mail provider. |

Worker algorithm (must follow):

1. Fetch email by `job.data.emailId`.
2. If missing or `sent`/`cancelled` → complete job, no send.
3. If `sending` and claim fresh → wait/skip (another worker).
4. If `sending` and claim stale → only a defined recovery path (re-claim or fail), never blind send.
5. Claim `scheduled` → `sending`.
6. Apply Redis delay + hourly checks; if blocked, revert to `scheduled` with new `planned_send_at`, delay job, return.
7. Send via Resend HTTPS (production) or SMTP (local fallback).
8. Persist `sent`, index ES, complete job.

---

## 9. Elasticsearch

- Index: `emails`
- Document id: `emails.id`
- Mapping: keyword ids, text subject/body/recipient, keyword status, dates
- Write path: after successful DB commit of status change (at least on `sent`; also index `scheduled` if search-all is required)
- Search API: query ES with `filter userId` from session, then optionally hydrate from Postgres for consistency
- ES down: log + retry queue (BullMQ `email-index` or async catch); **Postgres remains correct**

---

## 10. OAuth strategy

### Google

- `GET /auth/google` → Google authorization (openid email profile)
- `GET /auth/google/callback` → exchange code, upsert `users` on `google_sub`
- Create server session in `sessions` + **httpOnly, Secure (prod), SameSite=Lax** cookie
- Frontend never stores refresh/access tokens
- `GET /auth/me` for sidebar
- `POST /auth/logout` destroy session

Login page matches Figma (Google button primary). Email/password is **not** a working auth path.

### Slack

- `GET /integrations/slack/connect` (authenticated) → Slack OAuth (chat:write, identity, incoming-webhook if used)
- `GET /integrations/slack/callback` → store tokens on `slack_connections` for **session user**
- `DELETE /integrations/slack` disconnect
- `GET /integrations/slack` returns `{ connected, teamName }` **no tokens**
- Worker uses stored token to `chat.postMessage` on hourly cap; catch errors, log, continue

Redirect URIs and client secrets: env only.

---

## 11. API sketch (all authenticated unless noted)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/google` | Start Google OAuth |
| GET | `/auth/google/callback` | Callback |
| GET | `/auth/me` | Current user |
| POST | `/auth/logout` | Logout |
| GET | `/integrations/slack` | Connection status |
| GET | `/integrations/slack/connect` | Start Slack OAuth |
| GET | `/integrations/slack/callback` | Callback |
| DELETE | `/integrations/slack` | Disconnect |
| GET | `/emails/counts` | `{ scheduled, sent }` |
| GET | `/emails?folder=scheduled\|sent&q=&status=` | List (Postgres or ES) |
| GET | `/emails/:id` | Detail (owner check) |
| POST | `/emails/:id/star` | Toggle star |
| POST | `/batches` | Create schedule (JSON or multipart) |
| POST | `/batches/preview-csv` | Parse/validate leads |
| GET | `/admin/queues` | Bull Board |

Never accept `userId` in body for authorization.

---

## 12. Frontend architecture

- Vite + React + TypeScript + Tailwind + React Router
- Visual system from Figma: white canvas, green `#16a34a`-class primary, pale green selected nav, orange schedule pills, grey sent pills, rounded-full inputs
- Layout: `AppShell` (sidebar + main)
- Pages: `Login`, `Scheduled`, `Sent`, `EmailDetail`, `Compose`
- Data: fetch to Express with `credentials: 'include'`
- No hardcoded counts
- Compose state: recipients[], delay, hourlyLimit, scheduledAt, files
- CSV: parse file, validate, dedupe, chips + `+N`
- Loading/empty/error/toast

Figma screenshots: `docs/figma/*.png`.

---

## 13. Security architecture

- Session cookie auth on every data route
- Owner checks: `emails.user_id = session.userId`
- Zod validation
- DOMPurify (or equivalent) when rendering HTML body
- File upload limits
- Secrets in env; Slack tokens only on server
- CORS: frontend origin only, credentials true

---

## 14. Assumptions (to be confirmed if needed)

1. PostgreSQL over MySQL.
2. React SPA + Express, not Next.js.
3. UTC hourly windows.
4. Sender architecture:
   - **Logical Sender (UI)**: The authenticated user's Google email is always preserved as the logical sender and user identity.
   - **Provider Sender (Transport)**: When Resend is used, the actual provider `from` address is `RESEND_FROM` (e.g., the sandbox sender `onboarding@resend.dev` or a verified domain). SMTP (Ethereal) ignores arbitrary From addresses.
5. Email/password on the Figma login is not implemented.
6. Star is persisted; delete may cancel scheduled jobs if implemented as a stretch aligned with detail-page trash icon.
7. 1000-job demo via a documented seed/script or compose of a large CSV, not 1000 live SMTP in the 5-minute video.

---

## 15. Tradeoffs (pre-declared)

- **Exactly-once vs SMTP:** strongest practical is idempotent claim + jobId; dual-send remains possible if crash occurs after accept but before `sent`.
- **ES lag:** search may trail Postgres by seconds; lists for Scheduled/Sent should prefer Postgres for correctness, ES for full-text.
- **Bull Board exposure:** convenient for demo; lock down or local-only.
- **Hourly notify:** one Slack message per user per hour-window via Redis SETNX, not one per leftover job (avoid spam); include batch/job/limit/next time in that message.
