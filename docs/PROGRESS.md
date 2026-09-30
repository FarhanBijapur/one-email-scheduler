# Progress

Last updated: 2026-09-30

## Current phase

**Phase 7C — Product frontend and full API integration.** The React SPA now renders real scheduled/sent mail views, API search, safe email details, Slack connection controls, synchronized navigation counts, and the completed visual pass against the supplied ONE references.

---

## Completed

- Monorepo and npm workspace configuration
- Shared TypeScript, ESLint, and Prettier configuration
- API scaffold with the `/health` endpoint and infrastructure client helpers
- Worker process with development and start scripts, BullMQ job consumption, atomic claims, and SMTP delivery
- React, Vite, and Tailwind frontend scaffold; it is intentionally a placeholder
- PostgreSQL Docker Compose service with a durable volume
- Redis Docker Compose service with AOF persistence and a durable volume
- Elasticsearch Docker Compose service with a durable volume
- Environment configuration in `.env.example`, with `.env` ignored
- README limited to the current scaffold and local infrastructure
- Prisma 6.19.0 dependency declarations, schema, and database scripts
- PostgreSQL schema for users, sessions, Slack connections, email batches, emails, and email attachments
- Initial Prisma migration created with enum types, foreign keys, indexes, uniqueness constraints, and check constraints; it is pending first application to PostgreSQL
- Prisma client factories used by the existing API and worker infrastructure health checks
- T2B database access layer: focused Prisma repositories for users, sessions, Slack connections, email batches, emails, and attachments
- Atomic conditional email claim support, plus claim-token-guarded sent, failed, and reschedule persistence operations
- Atomic batch-and-email persistence through a short Prisma transaction
- T3 Google OAuth authorization-code flow with ID-token issuer, audience, and verified-email validation
- Redis-backed, cryptographically random, single-use OAuth state with a short TTL
- Opaque server-side PostgreSQL sessions in an httpOnly cookie, protected `/auth/me`, and idempotent logout
- Auth configuration: `WEB_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`, `SESSION_TTL_HOURS`, and `OAUTH_STATE_TTL_SECONDS`
- T4 authenticated endpoints: create email batch, scheduled emails, sent emails, actual counts, and user-scoped email detail
- Zod request validation, normalized/deduplicated recipient addresses, paginated email lists, and consistent API error handling
- Atomic EmailBatch plus Email persistence, sequence indexes beginning at zero, and UTC planned send times calculated from scheduled start plus per-email delay; the API accepts offset-bearing ISO-8601 timestamps
- T5A shared queue infrastructure: `packages/shared/src/queue/bullmq-connection.ts` and `packages/shared/src/queue/email-send.queue.ts`
- BullMQ queue name: `email-send`; job name: `send-email`; typed payload: `{ emailId, batchId, userId }`
- Shared role-aware Redis connection factory: API producers fail promptly; future worker consumers use BullMQ-compatible unlimited command retries
- Deterministic job ID helper returns the persisted Email UUID; UUIDs are valid BullMQ custom IDs because they contain neither colons nor only digits
- T5B API enqueue integration: `apps/api/src/services/email-queue.service.ts` adds one delayed `send-email` job per committed Email row
- T5B changed files: `apps/api/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/email-batches.ts`, `apps/api/src/controllers/email-batch-controller.ts`, `apps/api/src/services/email-batch.service.ts`, `apps/api/src/services/email-queue.service.ts`, `apps/api/src/lib/api-error.ts`, and `apps/api/src/middleware/error-handler.ts`
- Queue configuration: queue `email-send`, job `send-email`, payload `{ emailId, batchId, userId }`, and `jobId` equal to the persisted Email UUID
- Delay calculation: `max(0, plannedSendAt - Date.now())`, evaluated when each committed Email row is enqueued
- Ordering: the batch-and-email PostgreSQL transaction completes first; the API then reads the committed rows and enqueues them
- Enqueue consistency behavior: a BullMQ failure returns HTTP 503 with the committed `batchId`, persisted email count, and successful queue count; it never rolls back committed PostgreSQL rows
- Queueing is idempotent for a persisted Email because every enqueue attempt uses its deterministic UUID job ID; the enqueue service can be reused by a future reconciliation/outbox process
- T5C worker entrypoint: `apps/worker/src/index.ts` creates a BullMQ `Worker` for `email-send` using the shared consumer Redis connection and `WORKER_CONCURRENCY` (default `5`)
- T5C claim service: `apps/worker/src/services/email-claim.service.ts` validates `send-email` payload identifiers, loads the PostgreSQL Email, and checks its batch and user ownership against the payload
- Atomic claim behavior: the shared `EmailRepository.claimScheduledEmail` conditionally updates only `SCHEDULED` rows with no existing claim to `PROCESSING`, with a fresh `randomUUID()` claim token
- Duplicate and stale behavior: missing, inconsistent, already-claimed, or no-longer-scheduled jobs are logged and acknowledged without retrying or changing email state
- Graceful worker shutdown: `SIGINT` and `SIGTERM` close the BullMQ worker before disconnecting Prisma and Redis resources
- T5C changed files: `packages/shared/src/repositories/email.repository.ts`, `packages/shared/src/index.ts`, `packages/shared/package.json`, `apps/api/src/repositories/email.repository.ts`, `apps/worker/package.json`, `apps/worker/src/index.ts`, and `apps/worker/src/services/email-claim.service.ts`
- T5D reusable Nodemailer SMTP transport: `apps/worker/src/lib/smtp.ts` creates one pooled worker transport from `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_SECURE`; it is verified before the worker starts accepting jobs
- T5D delivery service: `apps/worker/src/services/email-delivery.service.ts` sends committed recipient, subject, HTML/text body, and batch sender data; no attachments are added because no attachment storage exists
- Successful SMTP acceptance conditionally transitions `PROCESSING` to `SENT` with `sentAt`, guarded by the original claim token
- SMTP failures conditionally transition `PROCESSING` to `FAILED` with a bounded non-secret failure reason, guarded by the original claim token
- Retry behavior: newly enqueued `send-email` jobs use three total attempts and 1-second exponential backoff; transient SMTP failures release the guarded claim to `SCHEDULED` before throwing for BullMQ retry, while permanent failures or the final transient attempt become `FAILED`
- SMTP delivery is at-least-once rather than exactly-once: a worker crash after SMTP accepts a message but before its guarded `SENT` update can leave the row `PROCESSING`; this phase deliberately does not attempt unsafe recovery or claim stealing
- T5D changed files: `apps/worker/src/lib/smtp.ts`, `apps/worker/src/services/email-claim.service.ts`, `apps/worker/src/services/email-delivery.service.ts`, `apps/worker/src/index.ts`, `apps/worker/package.json`, `apps/api/src/services/email-queue.service.ts`, `packages/shared/src/config.ts`, `packages/shared/src/queue/email-send.queue.ts`, `packages/shared/src/repositories/email.repository.ts`, `packages/shared/src/index.ts`, `.env.example`, `README.md`, `docs/TASKS.md`, and `docs/PROGRESS.md`
- T5E reservation engine: `apps/worker/src/services/email-rate-limit.service.ts` exposes `reserveSendSlot` with per-user scope, batch-configured minimum gap, hourly limit, and an optional UTC clock value for focused testing
- Key strategy: `one:email-rate:v1:{<encoded-user-id>}:next-slot` tracks the next per-user slot and `one:email-rate:v1:{<encoded-user-id>}:hour:<utc-window-ms>` tracks reservations for each UTC hour; there is no assignment-defined global rate-limit scope
- Atomicity: one Redis Lua script reads state, finds the earliest allowed UTC millisecond, reserves that hourly capacity, advances the next slot, applies expirations, and returns the reserved time without race-prone GET/SET calls
- Minimum-gap behavior: each reservation advances the per-user slot by `delayBetweenEmails`; a 1ms floor makes simultaneous zero-gap reservations distinct
- Hourly-limit behavior: reservations consume capacity rather than observing sent rows; once a UTC hour reaches `hourlyLimit`, the script reserves the first available slot in a later UTC hour instead of failing or dropping the email
- Failure behavior: Redis errors become `EmailRateLimitError`; the service never treats a failed Redis call as permission to send
- T5E established the reusable reservation boundary; T5F now imports that same service into the worker without changing its Redis algorithm
- T5E changed files: `apps/worker/src/services/email-rate-limit.service.ts`, `apps/worker/package.json`, `docs/TASKS.md`, and `docs/PROGRESS.md`
- T5F worker integration: `apps/worker/src/services/email-send-job-processor.ts` orchestrates the existing claim, Redis reservation, delayed rescheduling, and SMTP delivery services; the reservation command client uses the shared prompt-fail Redis producer configuration, not another limiter
- Reservation flow: after `SCHEDULED` to `PROCESSING`, the worker reserves a per-user slot using the batch `delayBetweenEmails` and `hourlyLimit`; SMTP runs only when `allowedAt <= Date.now()`
- Rescheduling: for a future slot, the claim-token-guarded `markScheduled` persists `plannedSendAt` and clears the `PROCESSING` claim before BullMQ 6.3.9 `job.moveToDelayed(allowedAt, token)` moves that same active UUID job to the delayed set; `DelayedError` prevents the worker from completing it
- Redis failure behavior: reservation errors release the claim through `releaseClaimForRetry` and rethrow so existing BullMQ retry/backoff handles the transient failure; SMTP is never bypassed
- Duplicate-job behavior: no new job is added during throttling, and every later delivery attempt must win the existing atomic `SCHEDULED` claim before it can reserve or send
- T5F changed files: `packages/shared/src/repositories/email.repository.ts`, `apps/worker/src/services/email-claim.service.ts`, `apps/worker/src/services/email-send-job-processor.ts`, `apps/worker/src/index.ts`, `README.md`, `docs/TASKS.md`, and `docs/PROGRESS.md`
- T6A Elasticsearch infrastructure: `packages/shared/src/search/email-search-index.ts` centralizes the official Elasticsearch client, an `emails` index mapping, safe index creation, document transformation, and the reusable `EmailSearchIndexService`
- Index design: the deterministic index is `emails`; each PostgreSQL Email UUID is the Elasticsearch document `_id`; mappings are explicit and strict for `emailId`, `batchId`, `userId`, recipient, sender, subject, body, status, planned/sent timestamps, sequence index, and creation timestamp
- Document design: `{ emailId, batchId, userId, recipient, sender, subject, body, status, plannedSendAt, sentAt, sequenceIndex, createdAt }`; it contains no credentials, session data, OAuth tokens, or SMTP secrets
- Reuse and authentication: API and future worker code can import the shared client/service; `ELASTICSEARCH_USERNAME` and `ELASTICSEARCH_PASSWORD` are optional configuration values that must be supplied together for secured deployments
- Index safety and failures: `ensureEmailSearchIndex` creates the index only when absent and tolerates a concurrent `resource_already_exists_exception`; it never deletes, recreates, or mutates an existing index. `EmailSearchIndexService` logs and rethrows Elasticsearch errors, while this phase deliberately has no PostgreSQL transaction or email lifecycle integration
- T6A changed files: `packages/shared/package.json`, `packages/shared/src/config.ts`, `packages/shared/src/index.ts`, `packages/shared/src/search/email-search-index.ts`, `apps/api/src/lib/elasticsearch.ts`, `.env.example`, `README.md`, `docs/TASKS.md`, and `docs/PROGRESS.md`
- T6B create-flow indexing: `EmailBatchService.create` reads the Email rows only after `createWithEmails` has committed, calls shared `indexEmailsBestEffort`, then proceeds with its existing delayed-job enqueueing. Elasticsearch failure therefore cannot roll back the batch or alter its existing queue error behavior.
- T6B worker indexing: `apps/worker/src/services/email-search-sync.service.ts` reloads the committed Email row and passes it to the Phase 6A transformer/service. It runs after successful `SCHEDULED -> PROCESSING` claims; `PROCESSING -> SCHEDULED` retry releases; rate-limit `plannedSendAt` reschedules; `PROCESSING -> SENT`; and `PROCESSING -> FAILED` updates.
- T6B bulk and identity behavior: the shared service uses Elasticsearch bulk index operations for new batches and deterministic `_id = Email UUID`, so a later update replaces the document rather than creating a duplicate. Every generated document includes the persisted `userId`.
- T6B failure behavior: strict indexing logs and rethrows for callers that need it; lifecycle paths use the explicitly named `indexEmailsBestEffort`, which preserves API, PostgreSQL, BullMQ, and SMTP outcomes after structured Elasticsearch error logging. No retry queue, timer, cron, reindex command, search API, or search UI was added.
- T6B changed files: `packages/shared/src/search/email-search-index.ts`, `apps/api/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/email-batches.ts`, `apps/api/src/services/email-batch.service.ts`, `apps/worker/src/index.ts`, `apps/worker/src/services/email-search-sync.service.ts`, `apps/worker/src/services/email-claim.service.ts`, `apps/worker/src/services/email-delivery.service.ts`, `apps/worker/src/services/email-send-job-processor.ts`, `docs/TASKS.md`, and `docs/PROGRESS.md`
- T6C search endpoint: authenticated `GET /api/emails/search` accepts only `q`, `status`, `page`, and `limit`. It is registered before `/api/emails/:id`, reads ownership only from `request.auth.user.id`, and never accepts a client-supplied user ID, Elasticsearch DSL, index, sort field, or search-field list.
- T6C validation and pagination: `q` is optional, trimmed, and capped at 500 characters; `status` is constrained to the Prisma `EmailStatus` enum; `page` is 1..100; and `limit` is 1..100. Elasticsearch receives the calculated `from` and `size`, with `track_total_hits: true` for the returned exact total.
- T6C search behavior: shared `EmailSearchIndexService.searchEmails` searches only the deterministic `emails` index, always applies `term userId = authenticated user`, optionally filters by keyword `status`, and uses fixed `multi_match` fields (`subject`, `body`, `recipient.text`, `sender.text`) plus exact recipient/sender keyword terms. Results contain only mapped email fields required by a future frontend.
- T6C failure behavior: Elasticsearch query errors are logged with non-secret request context in the shared service, then converted to the existing controlled `503 Email search is temporarily unavailable` API response. The endpoint has no PostgreSQL fallback.
- T6C changed files: `packages/shared/src/search/email-search-index.ts`, `packages/shared/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/email-search.ts`, `apps/api/src/controllers/email-search-controller.ts`, `apps/api/src/services/email-search.service.ts`, `docs/TASKS.md`, and `docs/PROGRESS.md`
- T6D Bull Board: `apps/api/src/routes/admin-queues.ts` attaches the official `BullMQAdapter` to the same `EmailSendQueue` instance created by `createEmailSendQueue`; it creates no queue, Redis connection, worker, timer, or custom queue-management API.
- T6D route and security: `/admin/queues` uses the existing `requireAuth` session middleware. The dashboard does not accept client authorization input, and the adapter receives no Redis, database, or other credentials. There is no admin-role model yet, so any authenticated application user can access the read-only dashboard.
- T6D visibility: the standard Bull Board UI exposes the existing queue's waiting, active, delayed, completed, and failed job views. `readOnlyMode: true` preserves an operational-monitoring intent and prevents Bull Board mutation controls.
- T6D packages: `@bull-board/api` and `@bull-board/express` are pinned to `6.14.1`, the compatible pair whose Express adapter explicitly supports the API's existing Express 4.21.2. `bullmq` is declared directly by the API for the adapter's runtime queue dependency. Installation and lockfile update remain pending because npm cannot start in this environment.
- T6D changed files: `packages/shared/src/queue/email-send.queue.ts`, `packages/shared/src/index.ts`, `apps/api/package.json`, `apps/api/src/routes/admin-queues.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `README.md`, `docs/TASKS.md`, and `docs/PROGRESS.md`
- T6E Slack OAuth: the API exposes authenticated `GET /api/slack/connect`, `GET /api/slack/status`, and `POST /api/slack/disconnect`, plus Slack's `GET /api/slack/callback`. `SlackOAuthStateStore` creates a cryptographically random 32-byte state, stores the authenticated application user ID in Redis with `OAUTH_STATE_TTL_SECONDS`, and atomically consumes it with GET-and-DEL before token exchange. Callback input never chooses an application user.
- T6E Slack connection: `@slack/web-api` 8.1.1 is declared in `packages/shared`; `SlackClient` builds the configured OAuth v2 authorization URL, exchanges `oauth.v2.access` codes, posts with `chat.postMessage`, and requests only `chat:write`. The token stays in `slack_connections.access_token`; status responses include only `connected`, team details, and destination name. Disconnect best-effort calls Slack `auth.revoke` for each active connection and removes all of that user's local connections even when revocation fails.
- T6E Slack configuration: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, and `SLACK_REDIRECT_URI` configure the app; the local callback default is `http://localhost:3001/api/slack/callback`. `SLACK_OAUTH_AUTHORIZE_URL` and `SLACK_API_URL` have official Slack defaults and permit controlled test endpoint overrides. The client ID and secret must be supplied together.
- T6E hourly-cap notification: after the existing claim-token-guarded `markScheduled`, persisted Elasticsearch sync, and `job.moveToDelayed`, the worker confirms the current UTC hourly reservation count is at capacity and sends a concise App Home notification through the existing user's Slack connection. The existing Lua reservation algorithm and delayed-job strategy are unchanged.
- T6E idempotency and failure behavior: `one:slack:hourly-cap:v1:{userId}:emailId:plannedSendAt` is claimed with Redis `SET ... NX` before attempting Slack, so repeated BullMQ executions do not send duplicates for the same rescheduling event. Redis idempotency, Slack-connection lookup, and Slack API failures are logged and skip the notification; they cannot fail, undo, or change the persisted email reschedule.
- T6E changed files: `packages/shared/package.json`, `packages/shared/src/config.ts`, `packages/shared/src/index.ts`, `packages/shared/src/repositories/slack.repository.ts`, `packages/shared/src/slack/slack-client.ts`, `apps/api/src/app.ts`, `apps/api/src/index.ts`, `apps/api/src/auth/slack-oauth-state.store.ts`, `apps/api/src/controllers/slack-controller.ts`, `apps/api/src/routes/slack.ts`, `apps/api/src/services/slack-oauth.service.ts`, `apps/api/src/repositories/slack.repository.ts`, `apps/worker/src/index.ts`, `apps/worker/src/services/email-rate-limit.service.ts`, `apps/worker/src/services/email-send-job-processor.ts`, `apps/worker/src/services/slack-hourly-limit-notification.service.ts`, `.env.example`, `README.md`, `docs/TASKS.md`, and `docs/PROGRESS.md`.
- T7A frontend authentication: `apps/web/src/api/client.ts` is the small typed browser client. It reads `VITE_API_URL` with a local `http://localhost:3001` fallback, attaches `credentials: 'include'`, handles JSON errors consistently, and does not store tokens or inspect cookies.
- T7A auth flow: `AuthProvider` calls the real `GET /auth/me` at startup, renders a checking, authenticated, unauthenticated, or request-error state, and keeps only the safe returned user object in React state. The login action navigates to `${VITE_API_URL}/auth/google`; the backend continues to own OAuth state, callback, and the httpOnly session cookie. Logout calls real `POST /auth/logout`, then clears frontend state.
- T7A shell and routes: the Figma-inspired login screen provides only the real Google action. The authenticated responsive shell includes sidebar, header, signed-in user display, logout, and conceptual `/`, `/scheduled`, and `/sent` paths with intentionally empty explanatory panels. It contains no hardcoded counts, email records, fake user, email/password form, or fake authentication.
- T7A design foundation: CSS establishes restrained white surfaces, pale-green navigation, green action styling, light borders, 8px-or-smaller rounded surfaces, loading and error states, and responsive sidebar behavior. `apps/web/.env.example` documents `VITE_API_URL`.
- T7A changed files: `apps/web/src/App.tsx`, `apps/web/src/api/client.ts`, `apps/web/src/auth/auth-context.tsx`, `apps/web/src/components/login-screen.tsx`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/index.css`, `apps/web/.env.example`, `README.md`, `docs/TASKS.md`, and `docs/PROGRESS.md`.
- T7B UI: the existing authenticated shell now follows the Figma's compact sidebar, pale-green selected navigation, one-line header, restrained borders, and green compose control. Scheduled and sent navigation counts are loaded only from authenticated `GET /api/emails/counts`; no email rows, dashboard records, or counts are hardcoded.
- T7B composer: `EmailComposer` supplies removable comma/Enter recipient chips, client email validation, duplicate prevention, subject/body fields, delay/hours controls, Send Later datetime and preset controls, submission/loading/success/error states, and responsive layouts. It sends only the existing `POST /api/email-batches` contract fields: `recipients`, `subject`, `body`, ISO `scheduledAt`, `delayBetweenEmails`, and `hourlyLimit`.
- T7B scheduling: Send now schedules with a one-minute future timestamp because the existing backend correctly rejects non-future `scheduledAt` values; Send Later requires a chosen future local date/time and serializes it as ISO-8601. The submit button disables while a request is pending and retains form values on failure.
- T7B attachments: file selection/removal and filename/size display are implemented in the composer, but no file is included in the API request. The existing backend has an attachment persistence model but no authenticated attachment upload endpoint or compatible batch field, so selected files remain local-only until such a contract exists.
- T7B changed files: `apps/web/src/api/client.ts`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/email-composer.tsx`, `apps/web/src/index.css`, `docs/TASKS.md`, and `docs/PROGRESS.md`.
- T7C scheduled/sent pages: `EmailList` loads authenticated `GET /api/emails/scheduled` or `GET /api/emails/sent` with the supported `page`/`pageSize` query parameters. It renders only returned recipient, subject, preview, persisted timing, status, and batch data; it supports refresh, pagination, loading, error, empty, and detail states. Scheduled/processing rows use the Figma-inspired orange time badge; sent rows use a quiet gray badge.
- T7C search: the `/search` shell page debounces requests to authenticated `GET /api/emails/search`, supports only backend `EmailStatus` values, sends fixed `q`, `status`, `page`, and `limit` parameters, and handles clear/loading/error/empty/pagination states. The browser does not call Elasticsearch directly.
- T7C email detail: clicking a scheduled or sent row loads authenticated `GET /api/emails/:id`; the detail surface exposes only recipient, sender, subject, body, status, persisted dates, batch reference, and the backend-returned attachment metadata. It does not surface claim tokens, OAuth values, or infrastructure state.
- T7C Slack UI: the overview has a small real Slack panel backed by `GET /api/slack/status`; it navigates to `GET /api/slack/connect` for OAuth and calls `POST /api/slack/disconnect` for the existing server-side revoke/remove behavior. It stores no token or connection secret in the browser.
- T7C counts synchronization: real `GET /api/emails/counts` values are displayed in the sidebar, refreshed after successful composition, each list load, initial shell load, and manually refreshed list views. There is no background polling or hardcoded count.
- T7C attachment limitation remains unchanged: the composer shows locally selected files but does not upload or submit them because there is no attachment-upload API route or batch-field contract.
- T7C changed files: `apps/web/src/api/client.ts`, `apps/web/src/components/app-shell.tsx`, `apps/web/src/components/email-list.tsx`, `apps/web/src/components/search-view.tsx`, `apps/web/src/components/slack-panel.tsx`, `apps/web/src/index.css`, `docs/TASKS.md`, and `docs/PROGRESS.md`.
- T10.9 visual pass: inspected all supplied ONE reference images in `docs/figma/`. The shell now uses the reference's narrow account-first sidebar, compact search header, unframed low-height mailbox rows, orange schedule badges, and restrained list spacing. The composer now visibly identifies the authenticated sender and keeps its existing real batch payload and attachment limitation.
- Final production audit: traced batch creation through PostgreSQL persistence, best-effort Elasticsearch indexing, and delayed queue enqueue; traced worker claims through Redis reservation, SMTP, guarded status persistence, search sync, and delayed rescheduling; and checked authenticated ownership on lists, detail, search, Slack, and Bull Board. No duplicate queue definition, cron, in-memory scheduler, browser token storage, screenshot UI, mock business data, or committed runtime secret was found.
- Final production audit fix: the Redis Lua reservation now returns whether it actually skipped an hourly-cap window. Slack notifications consume that atomic result, so a delay that happens to cross an hour because of the minimum-gap rule no longer produces a false hourly-cap notification.
- Final production audit documentation: `.env.example`, `.gitignore`, README, and task status now reflect the configuration and functionality actually present. Root and frontend environment templates remain separate because Vite reads `apps/web/.env`.

---

## Validation

- Inspected the workspace manifests, API, worker, frontend, shared configuration, Docker Compose file, Redis AOF configuration, `.env.example`, `.gitignore`, and README.
- Inspected the Prisma schema and initial migration for correspondence, including models, enum values, foreign keys, and indexes.
- Inspected repository method boundaries to confirm they contain Prisma persistence only and no HTTP, queue, SMTP, OAuth, Slack, Elasticsearch, or frontend logic.
- Inspected the OAuth routes, service, provider, middleware, cookie settings, and Redis state-store boundaries.
- Inspected batch API routes, controller, service, validation schemas, and user-scoped repository queries to confirm no queue, worker, SMTP, Slack, Elasticsearch, CSV upload, or frontend behavior was added.
- Inspected BullMQ job-ID constraints and shared queue/connection definitions, including the single API producer connection and queue instance.
- Inspected the enqueue service and batch-creation flow to confirm the database transaction completes before delayed jobs are added, the queue payload contains IDs only, and no BullMQ worker is created.
- Phase 5B: `npm run typecheck` was attempted but could not execute its script because Node failed during startup; no queue integration test could run.
- Phase 5C: static inspection confirms the worker has one `Worker` consumer, calls the shared atomic claim operation, and has no SMTP, sent/failed updates, rate limiting, or rescheduling code. `npm run typecheck` was attempted and failed before TypeScript ran because of the known Node startup `EPERM`.
- Phase 5D: static inspection confirms delivery is reachable only after a successful atomic claim, uses the original claim token for terminal updates, and contains no attachment, rate-limit, reschedule, Slack, Elasticsearch, Bull Board, or frontend behavior. Worker and shared package manifests parse as JSON. `npm run typecheck` was attempted and failed before TypeScript ran because of the known Node startup `EPERM`.
- Phase 5E: static inspection confirms the reservation service is standalone, has no worker/SMTP/BullMQ integration, and uses one Redis Lua script for per-user slot allocation. Worker and shared package manifests parse as JSON. `npm run typecheck` was attempted and failed before TypeScript ran because of the known Node startup `EPERM`.
- Phase 5F: static inspection confirms the worker imports the existing reservation service; reservation precedes SMTP; future reservations release `PROCESSING` with the original claim token before BullMQ's active-job delay API; and Redis failures release the claim before retrying. No timer, cron, or second limiter was added. Package manifests parse as JSON. `npm run typecheck` was attempted and failed before TypeScript ran because of the known Node startup `EPERM`.
- Phase 6A: static inspection confirms the Elasticsearch document shape is derived from persisted Email fields only, `_id` is the Email UUID, and no API route, worker flow, database transaction, search endpoint, or reindex process invokes the service. `npm run typecheck` was attempted and failed before TypeScript ran because of the known Node startup `EPERM`.
- Phase 6B: static inspection confirms the batch transaction resolves before API indexing starts; each worker indexing call follows the corresponding successful database update; and no Elasticsearch exception can alter a committed database state, SMTP result, or BullMQ transition. `npm run typecheck` was attempted and failed before TypeScript ran because of the known Node startup `EPERM`.
- Phase 6C: static inspection confirms `requireAuth` protects the search route, the controller derives `userId` solely from the authenticated session, and the shared search query always contains the user ID term filter. The route accepts only validated scalar query parameters, uses no PostgreSQL repository, and has no arbitrary Elasticsearch DSL path. `npm run typecheck` was attempted and failed before TypeScript ran because of the known Node startup `EPERM`.
- Phase 6D: static inspection confirms Bull Board receives only the API's existing `emailSendQueue` instance, `/admin/queues` is protected by `requireAuth`, and no independent Redis connection or queue factory was added. `npm run typecheck` and `npm run build` were attempted and both failed before their scripts started because of the known Node startup `EPERM`.
- Phase 6E: static inspection confirms the Slack state is random, Redis-backed, bound to the authenticated user, TTL-limited, and atomically single-use; no endpoint returns an access token; all state-changing/status routes derive the owner from the session or consumed state; and the worker notification occurs after the existing persisted reschedule, Elasticsearch sync, and same-job BullMQ delay. The notification has a Redis NX idempotency key and catches its own Redis, repository, and Slack errors. `npm run typecheck` and `npm run build` were attempted after implementation but failed before their scripts started because of the known Node startup `EPERM`.
- Phase 7A: static inspection confirms all browser API calls use the configured API origin with `credentials: 'include'`; Google login is a top-level navigation to the existing server route; `/auth/me` is the only authentication source; logout calls the existing server route; and no frontend token, password, secret, mock user, mocked email data, or localStorage authentication is present. Frontend typecheck and build were attempted but failed before their scripts started because of the known Node startup `EPERM`.
- Phase 7B: static inspection confirms counts call only authenticated `GET /api/emails/counts`, batch creation calls only authenticated `POST /api/email-batches` with its supported fields, recipients are validated/deduplicated, future scheduling is checked before submission, and the pending submit state prevents duplicate requests. There is no frontend queue/SMTP access, fake business data, attachment-upload call, or auth change. Frontend typecheck and build were attempted but failed before their scripts started because of the known Node startup `EPERM`.
- Phase 7C: static inspection confirms every list, search, detail, Slack, and count request goes through the credentialed typed API client and uses only existing API routes and response shapes. Search accepts only the five persisted `EmailStatus` values and aborts stale requests; list/detail requests abort on navigation. There are no mocked rows, counts, results, Slack states, client-side Elasticsearch calls, tokens, or attachment uploads. Frontend typecheck and build were attempted but failed before their scripts started because of the known Node startup `EPERM`.
- Final audit: API, worker, and frontend typecheck/build commands were attempted after the production-audit edits. All six were blocked before their scripts started by the same Node startup `EPERM`; static inspection was completed instead.

---

## Known environment limitations

- Node/npm validation is blocked before npm scripts start. Node v20.15.0 fails with `EPERM: operation not permitted, lstat 'C:\\Users\\LENOVO'` while resolving its startup path.
- Docker is unavailable on `PATH`, so Docker Compose was not started or validated in this environment.

---

## Not started

- Attachment upload
- CSV/text recipient ingestion
- Automated claim, rate-limit, and restart-persistence tests

---

## Tradeoffs logged

See `docs/ARCHITECTURE.md` §15. Summary:

- At-least-once SMTP; not mathematically exactly-once
- Postgres source of truth; ES best-effort search
- Figma email/password login will not be a fake auth backend
- Hourly Slack: one notification per window, not per remaining job

---

## Next task

T4.2 — CSV/text recipient ingestion with server-side validation. Do not start it without approval.
