# Implementation tasks

Do **not** start these until instructed. Work incrementally. Each task should leave the repo reviewable.

Definition of done for a task: code + env documented + no fake stand-ins for that slice.

---

## Phase 0 — Specification (done)

- [x] T0.1 `docs/REQUIREMENTS.md`
- [x] T0.2 `docs/ARCHITECTURE.md`
- [x] T0.3 `docs/PROGRESS.md`
- [x] T0.4 `docs/TASKS.md`
- [x] T0.5 Figma screenshots in `docs/figma/`

---

## Phase 1 — Scaffold and infrastructure

- [x] T1.1 Monorepo folders: `apps/api`, `apps/worker`, `apps/web`
- [x] T1.2 TypeScript + ESLint + shared tsconfig
- [x] T1.3 `docker-compose.yml`: PostgreSQL, Redis (AOF + volume), Elasticsearch
- [x] T1.4 `.env.example` (no secrets); `.gitignore` includes `.env`
- [x] T1.5 README stub: how to start infra only (full README later)

---

## Phase 2 — Database

- [x] T2.1 Migration tool (Prisma)
- [x] T2.2 Tables: users, sessions, slack_connections, email_batches, emails, email_attachments
- [x] T2.3 Status check constraints and unique recipient-per-batch
- [x] T2.4 Repository module with parameterized queries / ORM

---

## Phase 3 — Auth (Google)

- [x] T3.1 Google OAuth app env vars
- [x] T3.2 Start + callback routes, upsert user
- [x] T3.3 httpOnly session cookie
- [x] T3.4 `/auth/me`, logout, auth middleware
- [x] T3.5 Login page Figma (working Google button only)

---

## Phase 4 — Core API without sending

- [x] T4.1 Validation schemas (compose/schedule)
- [ ] T4.2 CSV/text parse + email validate + dedupe
- [x] T4.3 Create batch + email rows in a transaction
- [x] T4.4 List scheduled/sent, counts, get-by-id (owner scoped)
- [ ] T4.5 Star toggle
- [x] T4.6 Central errors + structured logs

---

## Phase 5 — BullMQ persistence

- [x] T5.1 Redis connection and `email-send` queue infrastructure (persistent; no jobs enqueued)
- [x] T5.2 Enqueue delayed jobs with `jobId = email.id`
- [x] T5.3 Worker process + `WORKER_CONCURRENCY`
- [x] T5D Ethereal SMTP delivery with guarded `SENT`/`FAILED` transitions and bounded retry
- [x] T5E Redis rate-limit reservation engine (standalone; not yet called by the worker)
- [x] T5F Rate-limit worker integration and active-job delayed rescheduling
- [x] T5.4 Bull Board at `/admin/queues` (authenticated, read-only; Phase 6D)
- [ ] T5.5 Restart test: delayed job survives API/worker restart

---

## Phase 6 — Idempotent worker + Ethereal

- [x] T6.1 Conditional DB claim before send
- [x] T6.2 Nodemailer Ethereal from env
- [x] T6.3 Persist sent/fail state
- [x] T6.4 Skip SMTP if already sent
- [ ] T6.5 Unit/integration tests for claim + duplicate job

---

## Phase 7 — Distributed rate limits

- [x] T7.1 Redis min-gap between sends (multi-worker safe)
- [x] T7.2 Redis hourly counter + delay remainder jobs
- [x] T7.3 Do not fail/drop/mark-sent on cap
- [x] T7.4 Preserve sequence when rescheduling
- [ ] T7.5 Tests for gap + hourly window

---

## Phase 8 — Elasticsearch

- [x] T8.1 Index mapping and indexing-service foundation (Phase 6A; no lifecycle integration)
- [x] T8.2 Index on status changes (non-blocking on failure; Phase 6B)
- [x] T8.3 Search API (user-scoped; Phase 6C)
- [x] T8.4 Frontend search UI wired to the authenticated API (Phase 7C)

---

## Phase 9 — Slack

- [x] T9.1 Slack OAuth connect/callback/store (Phase 6E)
- [x] T9.2 Status + disconnect UI (Phase 7C)
- [x] T9.3 Notify on hourly cap (Redis idempotency per email reschedule event; Phase 6E)
- [x] T9.4 Missing Slack is non-fatal

---

## Phase 10 — Frontend (Figma)

- [x] T10.1 Frontend auth foundation: real Google session, login, responsive shell, and conceptual routes (Phase 7A; no counts or email data)
- [x] T10.2 Scheduled list rows with real API data and orange timing badges (Phase 7C)
- [x] T10.3 Sent list rows with real API data (Phase 7C)
- [x] T10.4 Search, status filter, refresh, and pagination (Phase 7C)
- [x] T10.5 Email detail with real API data (Phase 7C)
- [x] T10.6 Compose: recipient chips, validation, duplicate prevention, subject/body, delay/hourly settings, local-only attachment selection, and real batch submit (Phase 7B)
- [x] T10.7 Send Later panel + presets (Phase 7B)
- [x] T10.8 Composer loading, success, and error states (Phase 7B)
- [x] T10.9 Visual pass vs `docs/figma/`

---

## Phase 11 — Hardening and 1000+

- [ ] T11.1 Bulk enqueue path efficient for 1000+ rows
- [ ] T11.2 Script or documented CSV to create 1000 delayed jobs without 1000 SMTP demo
- [ ] T11.3 Security pass: authz, XSS, uploads, env
- [ ] T11.4 Tests: validation, authz isolation, worker claim, rate limit
- [x] T11.5 Full README (architecture, demo script, tradeoffs, honesty)

---

## Phase 12 — Demo rehearsal

- [ ] T12.1 5-minute script from REQUIREMENTS §20
- [ ] T12.2 Verify delayed job in Bull Board
- [ ] T12.3 Restart persistence
- [ ] T12.4 Ethereal delivery + Sent view
- [ ] T12.5 Optional: hourly=3, Slack connected

---

## Next implementation slice (when approved)

T4.2 — CSV/text recipient ingestion with server-side validation, followed by automated claim/rate-limit and restart-persistence tests. Do not begin without approval.
