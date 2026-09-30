# Requirements Checklist

**Project:** ONE — production-oriented full-stack Email Job Scheduler  
**Role:** Software Development Engineer – Internship (Outbox Labs)  
**Product concept:** ReachInbox / Outbox email scheduling  
**Status:** Documentation only. No application code has been written.  
**Design source:** Figma screenshots in `docs/figma/`.

This file is the assignment contract. An item is complete only when implemented, tested, and not faked.

---

## 0. Product objective

Build a production-grade full-stack platform where an authenticated user can:

- [ ] Compose an email
- [ ] Provide one or many recipients
- [ ] Upload a CSV/text lead list
- [ ] Schedule emails for a specific future time
- [ ] Configure delay between individual emails
- [ ] Configure an hourly email sending limit
- [ ] View scheduled emails
- [ ] View sent emails
- [ ] Search emails
- [ ] Receive a real Slack notification when the hourly limit is reached

Scheduling must use **BullMQ + Redis**. Cron is forbidden.

---

## 1. Required technology

### Backend

- [ ] Node.js
- [ ] TypeScript
- [ ] Express.js
- [ ] BullMQ
- [ ] Redis (persistent)
- [ ] PostgreSQL (chosen relational store; MySQL is allowed by the assignment)
- [ ] Ethereal Email / SMTP (real sends)
- [ ] Elasticsearch
- [ ] Bull Board (or equivalent official BullMQ dashboard)

### Frontend

- [ ] React + TypeScript (Vite). Next.js is allowed; React SPA is chosen to keep API/session ownership on Express.
- [ ] Tailwind CSS
- [ ] UI must follow Figma, not a generic SaaS dashboard

### Auth / integrations

- [ ] Real Google OAuth
- [ ] Real Slack OAuth, persisted per user
- [ ] Real Slack notification on hourly-limit hit

### Infrastructure

- [ ] Docker Compose for Redis, PostgreSQL, Elasticsearch
- [ ] Environment variables for all secrets and configuration
- [ ] `.env` never committed

---

## 2. Absolute prohibitions

Never introduce:

- [ ] cron / crontab / OS-level cron
- [ ] `node-cron`
- [ ] Agenda
- [ ] Fake OAuth
- [ ] Fake email sending (`console.log` instead of SMTP)
- [ ] Fake Slack integration
- [ ] Hardcoded dashboard counts (e.g. Scheduled 12, Sent 785)
- [ ] In-memory-only scheduling
- [ ] In-memory-only rate limiting
- [ ] Hardcoded secrets
- [ ] Mock implementations presented as real
- [ ] Trusting `userId` from the frontend
- [ ] Storing sensitive auth credentials in `localStorage`

---

## 3. Core scheduling pipeline

When scheduling a batch, the backend must:

1. [ ] Validate the request
2. [ ] Persist batch/scheduling metadata in PostgreSQL
3. [ ] Persist one email/recipient row per recipient
4. [ ] Enqueue persistent BullMQ jobs
5. [ ] Use **delayed** BullMQ jobs for future execute-at times
6. [ ] Run a separate worker process to consume jobs
7. [ ] Send mail via Ethereal SMTP (not a stub)
8. [ ] Persist status transitions in PostgreSQL
9. [ ] Index sent (and status-changed) emails in Elasticsearch for search

PostgreSQL is the source of truth. Elasticsearch is the search index only.

---

## 4. Restart persistence (critical)

- [ ] Redis/BullMQ configured for persistence (AOF and/or RDB, durable volume)
- [ ] PostgreSQL persists email/batch state
- [ ] If API server stops, worker stops, or the app restarts, a future scheduled job must still execute at the correct time
- [ ] Demo must show: schedule → delayed job visible → stop processes → restart → job still delayed/pending → send occurs

---

## 5. Idempotency / duplicate-send protection

The worker must **never** send solely because a BullMQ job was received. It must check DB state first.

- [ ] Deterministic job IDs (`jobId` = email row ID / stable UUID)
- [ ] Unique database constraints that prevent duplicate “live” jobs per email
- [ ] Explicit email status machine with safe transitions
- [ ] Conditional claim before SMTP (`UPDATE … WHERE status IN (scheduled, queued, delayed) AND claimed_at IS NULL` or equivalent)
- [ ] Worker concurrency safety (no double send from two workers)
- [ ] Duplicate BullMQ job delivery must be a no-op after a successful send
- [ ] Retry safety: retries must not re-send an already-sent email
- [ ] Document the remaining at-least-once / SMTP gap (exactly-once is not guaranteed)

---

## 6. Concurrency

- [ ] `WORKER_CONCURRENCY` env (example: `5`)
- [ ] Multiple jobs processed in parallel safely
- [ ] No race that lets two workers send the same email
- [ ] Per-sender/tenant rate limits remain correct across workers/processes
- [ ] Do not use in-memory JS variables for scheduling or rate limits

---

## 7. Minimum delay between emails

- [ ] User-configurable delay (example: 5 seconds)
- [ ] Emails for that batch/sender must not send faster than this interval
- [ ] Safe with multiple workers
- [ ] Coordinated in Redis (or equivalent distributed store), not process memory
- [ ] Preserve reasonable send order within a batch

---

## 8. Hourly email limit

- [ ] User-configurable hourly cap (example: 50)
- [ ] Enforced with Redis (or other distributed persistent coordination)
- [ ] Works with multiple worker processes/instances
- [ ] When the cap is hit:
  - [ ] Do **not** permanently fail remaining emails
  - [ ] Do **not** drop them
  - [ ] Do **not** mark them sent
  - [ ] Compute next valid execution time
  - [ ] Reschedule/delay the BullMQ job
  - [ ] Preserve ordering as reasonably possible
- [ ] Example: hourly limit 3, 10 emails → 3 in current hour, remainder move to next window(s)
- [ ] Send a real Slack notification (if Slack is connected) when the limit is reached
- [ ] If Slack is not connected: continue scheduling, do not crash, do not fail emails

---

## 9. Large queue (1000+ jobs)

Not required to SMTP 1000 real messages in the demo.

Must demonstrate:

- [ ] 1000 jobs can be created
- [ ] Jobs persist in BullMQ
- [ ] Delayed jobs remain available across restarts
- [ ] Workers process safely
- [ ] Rate limiting controls execution
- [ ] Jobs are not silently lost

---

## 10. Elasticsearch

Index useful fields:

- [ ] email ID, user ID, recipient, sender, subject, body, status
- [ ] scheduled time, sent time, batch ID, created time

Search:

- [ ] Search UI wired to backend
- [ ] Useful fields: recipient, subject, body, status
- [ ] Scope to the authenticated user only
- [ ] ES outage must not corrupt PostgreSQL email state (index asynchronously / retry / log)

---

## 11. BullMQ dashboard

- [ ] Live Bull Board (or equivalent) mounted, documented URL
- [ ] Inspect waiting, delayed, active, completed, failed
- [ ] A future scheduled email appears as a **delayed** job

---

## 12. Ethereal SMTP

- [ ] Real SMTP send via nodemailer (or equivalent)
- [ ] Config from env (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, etc.)
- [ ] README documents creating an Ethereal account and capturing the preview URL
- [ ] Not replaced by `console.log`

---

## 13. Google OAuth

Required flow:

- [ ] Login page (Figma)
- [ ] Google authorization
- [ ] Backend callback
- [ ] Create/update user
- [ ] Authenticated httpOnly session cookie (not tokens in `localStorage`)
- [ ] Redirect to dashboard
- [ ] Header/sidebar shows Google name, email, avatar
- [ ] Logout works
- [ ] No fake login, no hardcoded user

**Figma note:** the login screen also shows Email ID / Password. Assignment forbids fake login. **Google OAuth is the only implemented auth.** Email/password fields may be shown disabled or omitted; they will not authenticate.

---

## 14. Slack OAuth

- [ ] Connect Slack → real OAuth → backend callback
- [ ] Persist connection for the authenticated user (tokens encrypted at rest if practical; never returned to frontend)
- [ ] Connected state visible in UI
- [ ] Disconnect Slack
- [ ] Reconnect later without redeploy
- [ ] On hourly limit: real Slack message with batch, recipient/job, configured limit, next execution time
- [ ] Missing Slack connection is non-fatal
- [ ] Slack client secret / bot tokens never exposed to the frontend

---

## 15. Frontend screens (Figma)

Visual language: white background, minimal, green primary, pale green selected, light borders, rounded controls, large whitespace, left sidebar, email-client layout. Product mark in Figma is **ONE**.

| Screen | File | Required |
| --- | --- | --- |
| Login | `docs/figma/01-login.png` | [ ] |
| Scheduled Emails | `docs/figma/02-scheduled-emails.png` | [ ] |
| Sent Emails | `docs/figma/03-sent-emails.png` | [ ] |
| Email Detail | `docs/figma/04-email-detail.png` | [ ] |
| Compose + Send Later panel | `docs/figma/05-compose-send-later.png` | [ ] |
| Compose + attachment | `docs/figma/06-compose-attachment.png` | [ ] |
| Compose + recipient chips / Upload List | `docs/figma/07-compose-recipient-chips.png` | [ ] |

### Scheduled list row

- [ ] Recipient (`To:`)
- [ ] Orange schedule badge with weekday + time
- [ ] Subject + “Scheduled”
- [ ] Body preview
- [ ] Star/action

### Sent list row

- [ ] Recipient
- [ ] Grey “Sent” badge
- [ ] Subject
- [ ] Preview
- [ ] Star/action

### Sidebar

- [ ] ONE logo
- [ ] User avatar, name, email
- [ ] Account dropdown (logout, Slack connect/disconnect)
- [ ] Compose button (green outline pill)
- [ ] Scheduled / Sent with **API-backed counts**
- [ ] Pale green selected nav item

### Main toolbar

- [ ] Search
- [ ] Filter
- [ ] Refresh

### Compose

- [ ] Sender selection
- [ ] Recipient entry + chips (overflow `+N`)
- [ ] Upload List (CSV/text parse on backend or validated client parse + backend re-validation)
- [ ] Email validation, duplicate removal, recipient count
- [ ] Subject, rich-text body
- [ ] Attachment (paperclip indicator)
- [ ] Delay between 2 emails, Hourly Limit
- [ ] Clock → Send Later panel (date/time + presets: Tomorrow, Tomorrow 10:00 AM, 11:00 AM, 3:00 PM)
- [ ] Cancel / Done on panel; primary action becomes **Send Later**
- [ ] Submits to real backend APIs

### Email detail

- [ ] Back, subject, reference id
- [ ] Star / delete / more
- [ ] From (name + address), to me, timestamp
- [ ] Body + attachment cards

---

## 16. Loading / error / empty

- [ ] List loading skeletons or spinners
- [ ] Empty scheduled / empty sent
- [ ] API error states
- [ ] Success feedback / toasts (schedule created, Slack connected, etc.)
- [ ] Never a blank page during fetches

---

## 17. Security

- [ ] All email APIs scoped by session user
- [ ] Input validation (zod or equivalent)
- [ ] Parameterized SQL / ORM (no injection)
- [ ] Sanitize HTML in body display (XSS)
- [ ] Reject invalid schedule times, malformed CSV, invalid emails
- [ ] Attachment size/type limits
- [ ] Secrets only in env
- [ ] Bull Board should not be a public unauthenticated surface in production-like setup (document local demo auth or bind)

---

## 18. Code quality

- [ ] TypeScript throughout
- [ ] Controllers / services / repositories
- [ ] Central error handling
- [ ] Structured logging (not `console.log` everywhere)
- [ ] Tests for validation, status machine, rate limit, idempotency claim
- [ ] No giant files, dead code, or commented-out dumps

---

## 19. Documentation (README)

README must cover (and must not claim unimplemented features):

- [ ] Overview, architecture, folder structure
- [ ] Setup, env vars, Docker, DB, Redis, Elasticsearch
- [ ] Ethereal, Google OAuth, Slack OAuth
- [ ] Running API, frontend, worker, Bull Board
- [ ] API endpoints
- [ ] Scheduling, restart persistence, rate limiting, concurrency, idempotency
- [ ] 1000+ behavior, assumptions, tradeoffs, testing, 5-minute demo script

---

## 20. Demo (max 5 minutes)

- [ ] Google login
- [ ] Dashboard
- [ ] Compose, upload recipients, delay + hourly limit, schedule
- [ ] Scheduled list
- [ ] BullMQ delayed job
- [ ] Stop worker/server, restart, job survives
- [ ] Email sends (Ethereal)
- [ ] Sent list
- [ ] Rate limiting if practical
- [ ] Slack notification if practical
