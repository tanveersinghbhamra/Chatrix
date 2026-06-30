# 🚀 Chatrix — Complete Build Context

> Paste this at the start of every new Claude session. No need to re-explain anything.
> Last updated: Session 1 Review Complete — June 27, 2026

---

## Product

WhatsApp AI SaaS. Any business signs up, connects their WhatsApp number, gets an AI bot that handles enquiries 24/7, qualifies leads, books appointments, sends follow-up drip messages. Targets UAE market. Generic — works for any business type (real estate, clinic, salon, gym, restaurant, law firm, etc).

---

## Team

Two final year CS graduates, Pune, India. React + Node.js + TypeScript. 1–2 hrs/day each. Tanveer owns the backend. Classmate owns the React dashboard (Session 13).

---

## Tech Stack

```
Backend:    Node.js v22 + Express + TypeScript (strict)
Frontend:   Next.js + Tailwind (classmate builds — Session 13)
Database:   Supabase PostgreSQL (transaction pooler, Singapore ap-southeast-1)
Redis:      Upstash Redis (Singapore ap-southeast-1, free tier)
AI:         Anthropic Claude API — claude-sonnet-4-6
WhatsApp:   Meta Cloud API v21.0 direct (no middleman)
Payments:   Stripe (UAE AED)
Server:     Render ($7/month)
Frontend:   Vercel (free)
Queue:      Bull v4 backed by Upstash Redis
```

---

## Pricing Plans

```
Trial:   Free 14 days — 100 conversations, 1 broadcast, 1 agent, 3 drip steps
Starter: AED 149/month — 500 conversations, 1 broadcast/500 contacts, 1 agent, 3 drip steps
Growth:  AED 299/month — 2000 conversations, 4 broadcasts/2000 contacts, 3 agents, 5 drip steps
Pro:     AED 599/month — unlimited (99999) conversations, 99 broadcasts, 99 agents, 99 drip steps
```

Meta conversation costs passed through separately. Client pays Meta directly. Chatrix charges platform fee only.

---

## Repository

```
github.com/Tanveer0612/Chatrix (private, monorepo)
├── backend/   ← Node.js API (Tanveer)
└── frontend/  ← Next.js dashboard (classmate, Session 13)
```

---

## Environment Variables (backend/.env)

```env
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres.hzyhasbnzuljjryxvnrn:[PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres

# Redis (recreated June 27 — was deleted after 14 days inactivity)
UPSTASH_REDIS_REST_URL=https://[NEW-URL].upstash.io
UPSTASH_REDIS_REST_TOKEN=[NEW-TOKEN]

# AI
ANTHROPIC_API_KEY=sk-ant-[KEY]

# Meta WhatsApp
META_APP_ID=[ID]
META_APP_SECRET=[SECRET]
META_VERIFY_TOKEN=chatrix_webhook_verify_2025

# Stripe (optional until Session 9)
STRIPE_SECRET_KEY=sk_test_[KEY]
STRIPE_WEBHOOK_SECRET=whsec_[SECRET]

# JWT
JWT_ACCESS_SECRET=[64 char hex]
JWT_REFRESH_SECRET=[64 char hex]
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Encryption
ENCRYPTION_KEY=[exactly 32 chars]

# Frontend
FRONTEND_URL=http://localhost:3001
```

**Rules:**

- Never read `process.env` outside `config/index.ts` (one exception: `logger.ts` — circular dependency)
- All required vars validated at startup via `requireEnv()` — server refuses to start if missing
- `ENCRYPTION_KEY` validated to be exactly 32 characters at startup
- Stripe vars are optional — server starts without them, billing routes validate before use

---

## Complete File Structure (Session 1 Complete)

```
backend/
├── src/
│   ├── app.ts                              ✅ complete
│   ├── config/
│   │   └── index.ts                        ✅ complete
│   ├── db/
│   │   ├── index.ts                        ✅ complete (Kysely + pg pool)
│   │   ├── migrate.ts                      ✅ complete (with schema_migrations tracking)
│   │   ├── types.ts                        ✅ complete (all 14 tables typed)
│   │   └── migrations/
│   │       ├── 001_init.sql               ✅ complete
│   │       ├── 002_fixes.sql              ✅ complete
│   │       └── 003_additions.sql          ✅ complete
│   ├── middlewares/
│   │   ├── rateLimiter.middleware.ts       ✅ complete
│   │   ├── requestId.middleware.ts         ✅ complete
│   │   └── validate.middleware.ts          ✅ complete
│   ├── services/
│   │   ├── crypto.service.ts              ✅ complete
│   │   └── whatsapp.service.ts            ✅ complete (all media functions added)
│   ├── types/
│   │   ├── environment.d.ts               ✅ complete
│   │   └── express.d.ts                   ✅ complete
│   ├── utils/
│   │   ├── errors.ts                      ✅ complete
│   │   ├── helpers.ts                     ✅ complete
│   │   └── logger.ts                      ✅ complete
│   └── validators/
│       └── auth.validator.ts              ✅ complete
├── .env                                   ✅ configured
├── .env.example                           ✅ committed
├── .gitignore                             ✅ configured
├── package.json                           ✅ complete
└── tsconfig.json                          ✅ complete
```

---

## Database — 14 Tables + 1 Migration Tracking Table

```
schema_migrations    — tracks which SQL files have run (created by migrate.ts itself)
tenants              — one row per business
users                — dashboard login accounts
contacts             — WhatsApp contacts/leads
messages             — every WhatsApp message (inbound + outbound)
broadcasts           — bulk campaigns
broadcast_recipients — individual send status per contact per broadcast
drip_templates       — follow-up sequences
plan_limits          — what each plan includes (seeded)
webhook_events       — Meta webhook idempotency log
notifications        — persistent agent alerts
onboarding_progress  — setup checklist (auto-created on tenant signup via trigger)
audit_logs           — immutable action history
refresh_tokens       — multi-device sessions (replaces single users.refresh_token)
contact_notes        — internal agent notes (not sent to customer)
```

---

## Key Architecture Decisions

### 1. Multi-tenant isolation

Every table has `tenant_id`. Every query filters by it. `ON DELETE CASCADE` from tenants propagates to all child tables. Nothing in the DB can orphan across tenants (enforced at application layer too — see Known Gaps #5).

### 2. Memory summary pattern

`contacts.conversation_summary` + last 6 raw messages sent to Claude. Never send full history — too slow, too expensive. After each AI response, summary is regenerated.

### 3. Webhook idempotency — two layers

- `webhook_events.event_id UNIQUE` — DB-level dedup
- Bull `jobId: messageId` — queue-level dedup
  Both needed: DB is durable across restarts, Bull's dedup is in-window only.

### 4. AES-256-GCM encryption

WhatsApp access tokens encrypted before DB storage using `crypto.service.ts`. Format: `iv:authTag:encryptedData` (hex, colon-separated). `ENCRYPTION_KEY` must be exactly 32 UTF-8 characters (use `openssl rand -hex 16` for production — 32 hex chars = 128 bits real entropy).

### 5. Refresh token rotation

Every use of a refresh token invalidates it (`used = true`) and issues a new one. Prevents stolen token reuse. Stored as bcrypt hash. Multi-device: one row per device session in `refresh_tokens` table.

### 6. Drip job tracking

`contacts.drip_job_id` stores the Bull job ID. When a customer replies, the pending drip job is cancelled via `messageQueue.getJob(contact.drip_job_id).remove()`.

### 7. Opt-out tracking

`contacts.opted_out` — legal requirement for UAE PDPL. Must check before every outbound message. Three reasons: `customer_request`, `stop_keyword`, `admin_removed`.

### 8. Per-tenant email uniqueness

`UNIQUE(tenant_id, email)` on users table — same person can be agent at multiple businesses.

### 9. Redis rate limiting

`@upstash/ratelimit` sliding window. Fails open (if Redis down, requests allowed through — rate limiter going down must not take down the API). Three limiters: general (100/15min), auth (5/15min), webhook (1000/1min).

### 10. Meta costs off-books

Clients pay Meta directly per conversation. Chatrix charges platform fee only. This is by design — simplifies billing, avoids being a payment intermediary for Meta costs.

### 11. Kysely for all DB queries

`db.*` (Kysely typed instance) for all queries. Raw `query()` function ONLY in `migrate.ts`. This gives full compile-time type safety — accessing a non-existent column is a TypeScript error, not a runtime crash.

### 12. Migration tracking

`schema_migrations` table — each migration file recorded after running. Re-running `npm run migrate` skips already-applied migrations. Safe to run on every deploy.

### 13. `express.raw()` for webhooks

Meta webhook endpoint uses `express.raw({ type: 'application/json' })` BEFORE `express.json()`. Signature verification requires raw bytes — once parsed to JSON, the original bytes are lost and verification always fails.

### 14. `trust proxy: 1`

Required on Render. Without it, `req.ip` returns Render's internal proxy IP for all requests. Rate limiting would treat all users as one IP — effectively disabled. `1` = trust exactly one proxy (Render's load balancer).

---

## WhatsApp Service — Complete Function List

All in `src/services/whatsapp.service.ts`:

### Sending

```typescript
sendTextMessage(params); // text with optional link preview
sendImageMessage(params); // image by URL or mediaId, optional caption
sendVideoMessage(params); // video by URL or mediaId, optional caption
sendAudioMessage(params); // audio by URL or mediaId (no caption — Meta limitation)
sendDocumentMessage(params); // document by URL or mediaId, optional filename + caption
sendStickerMessage(params); // WebP sticker by URL or mediaId
sendLocationMessage(params); // lat/lng/name/address
sendReactionMessage(params); // emoji reaction to a specific message (empty = remove)
sendInteractiveButtons(params); // 1-3 quick reply buttons
sendInteractiveList(params); // scrollable menu with sections and rows
sendContactMessage(params); // vCard-style contact sharing
sendTemplateMessage(params); // pre-approved Meta template
```

### Media

```typescript
uploadMedia(params); // upload Buffer to Meta, returns mediaId (reusable 30 days)
getMediaUrl(accessToken, mediaId); // get download URL from mediaId (expires ~5min)
downloadMedia(accessToken, url); // download file bytes from Meta URL
```

### Utility

```typescript
markAsRead(params); // mark message as read (never throws — best-effort)
verifyWebhookSignature(payload, signature); // HMAC-SHA256 with timingSafeEqual
getPhoneNumberDetails(params); // display_phone_number, verified_name, quality_rating
```

### Type Guards (for Session 2 webhook handler + Session 5 processor)

```typescript
isMediaMessage(messageType); // image | video | audio | document | sticker
isInteractiveMessage(messageType); // interactive
isLocationMessage(messageType); // location
isReactionMessage(messageType); // reaction
```

### Exported Constants (for Session 5)

```typescript
SUPPORTED_MIME_TYPES; // { image: [...], video: [...], audio: [...], document: [...], sticker: [...] }
MEDIA_SIZE_LIMITS; // { image: 5MB, video: 16MB, audio: 16MB, document: 100MB, sticker: 100KB }
```

### MediaSource Union Type

```typescript
type MediaSource =
    | { url: string; mediaId?: never } // send by URL — Meta downloads it
    | { mediaId: string; url?: never }; // send by pre-uploaded media ID
```

Never both, never neither — enforced at compile time.

### WhatsAppError

```typescript
class WhatsAppError extends Error {
    metaErrorCode: number; // Meta's numeric error code
    metaErrorType: string; // human-readable type e.g. "RECIPIENT_NOT_ON_WHATSAPP"
    isRetryable: boolean; // true for 130429 (rate limited) and 133004 (server error)
    // false for permanent errors (bad recipient, expired token)
}
```

`isRetryable` drives Bull job retry logic in Session 5.

---

## Error Hierarchy

All in `src/utils/errors.ts`:

```typescript
AppError(base); // isOperational: true, shows message to client
NotFoundError; // 404 — resource doesn't exist
UnauthorizedError; // 401 — not authenticated
ForbiddenError; // 403 — authenticated but not permitted
ValidationError; // 400 — request body/params failed Zod validation
ConflictError; // 409 — duplicate (email, phone, unique constraint)
TooManyRequestsError; // 429 — HTTP rate limit hit
PlanLimitError; // 429 — tenant hit plan usage limit (different from HTTP rate limit)
ServiceUnavailableError; // 503 — DB/Redis/Meta API temporarily down
```

Plain `Error` (not AppError) = programmer bug → shows "Internal server error" in production.

`app.ts` global error handler reads `isOperational` to decide what to show the client.

---

## Validation (Zod)

All in `src/validators/auth.validator.ts`:

```typescript
signupSchema; // email, password, fullName, businessName, businessType (optional, defaults 'general')
loginSchema; // email, password, tenantId (optional — for multi-tenant users)
forgotPasswordSchema; // email
resetPasswordSchema; // token, password
changePasswordSchema; // currentPassword, newPassword (refine: must differ)
refreshTokenSchema; // refreshToken
inviteUserSchema; // email, fullName, role (agent | viewer — owners cannot be invited)
```

Password rules (shared `passwordSchema`):

- min 8, max 72 chars (bcrypt silently truncates above 72)
- at least 1 uppercase, 1 digit, 1 special character

`validate.middleware.ts` applies coerced/transformed values back to `req.body` — `.toLowerCase()` and `.trim()` actually take effect. Unknown fields are stripped.

---

## Typed Database Layer

`src/db/types.ts` exports:

```typescript
// Table interfaces (snake_case matching DB columns exactly)
(TenantsTable,
    UsersTable,
    ContactsTable,
    MessagesTable,
    BroadcastsTable,
    BroadcastRecipientsTable,
    DripTemplatesTable,
    PlanLimitsTable,
    WebhookEventsTable,
    NotificationsTable,
    OnboardingProgressTable,
    AuditLogsTable,
    RefreshTokensTable,
    ContactNotesTable);

// Database map (passed to Kysely<Database>)
Database;

// Convenience types for service layer
(Tenant, NewTenant, TenantUpdate);
(User, NewUser, UserUpdate);
(Contact, NewContact, ContactUpdate);
(Message, NewMessage, MessageUpdate);
(Broadcast, NewBroadcast, BroadcastUpdate);
(BroadcastRecipient, NewBroadcastRecipient);
// ... etc for all tables

// JSONB shape interfaces
(BotConfig, LocationData, ReactionData);

// Enum types
(Plan,
    PlanStatus,
    UserRole,
    LeadScore,
    MessageDirection,
    MessageStatus,
    MessageType,
    BroadcastStatus,
    RecipientStatus,
    NotificationType,
    ReportChannel);
```

Usage:

```typescript
import { db } from '../db/index.js'
import type { NewMessage, Contact } from '../db/types.js'

// Fully typed insert
const msg: NewMessage = { tenant_id: '...', contact_id: '...', ... }
await db.insertInto('messages').values(msg).execute()

// Fully typed select
const contact = await db
  .selectFrom('contacts')
  .selectAll()
  .where('tenant_id', '=', tenantId)
  .where('phone', '=', phone)
  .executeTakeFirst()
// contact is Contact | undefined — TypeScript knows every field
```

---

## Express Request Extensions

`src/types/express.d.ts` adds to `Express.Request`:

```typescript
id: string           // set by requestId.middleware.ts — UUID for every request
user?: AuthPayload   // set by auth middleware (Session 6) — JWT payload
tenant?: TenantRecord        // set by auth middleware — full tenant from DB
currentUser?: UserRecord     // set by auth middleware — full user from DB
```

`AuthPayload` contains: `userId`, `tenantId`, `role`, `email` — baked into JWT at login.

---

## Utilities

### `src/utils/helpers.ts`

```typescript
sanitizePhone(phone); // strips +, spaces, dashes → '971501234567'
isValidPhone(phone); // 7-15 digits after sanitizing
paginate({ page, limit, maxLimit }); // returns { page, limit, offset } for DB queries
isValidUUID(value); // validates UUID v4 format — use before any ID param DB lookup
sleep(ms); // async pause — for retries and rate limiting
generateOTP((length = 6)); // cryptographically secure numeric OTP
getErrorMessage(error); // safely extracts message from unknown catch error
successResponse(data, message); // { success: true, message, data }
paginatedResponse(data, page, limit, total); // { success: true, data, pagination: { ... } }
```

### `src/utils/logger.ts`

```typescript
logger.info / warn / error / debug(message, metadata);
maskSensitive(obj); // redacts password, token, secret, apiKey, authorization, encryptionKey, accessToken, refreshToken
```

Dev format: colorized, human-readable. Production format: JSON (for Render log viewer + future Datadog).
**Note:** `maskSensitive` is exported but not yet used in logging calls — add in Sessions 6+ when logging user objects.

### `src/utils/errors.ts`

See Error Hierarchy section above.

---

## Session Build Order

```
Session 1  ✅ — Foundation, DB, security, types, migrations, whatsapp service (LIVE VERIFIED against real Supabase + Upstash, 2026-06-30)
Session 2  ✅ — WhatsApp webhook receiver (LIVE VERIFIED end-to-end against real Supabase + Upstash, 2026-06-30 — see "Session 2 Live Verification" below)
Session 3  🟡 — Claude AI service (claude.service.ts built + reviewed, NOT yet live-tested — blocked on real ANTHROPIC_API_KEY)
Session 4  ⬜ — Safety validator
Session 5  ⬜ — Message processor Bull job
Session 6  ⬜ — Auth (signup, login, JWT, refresh tokens)
Session 7  ⬜ — Contacts + messages API routes
Session 8  ⬜ — Drip system
Session 9  ⬜ — Billing (Stripe)
Session 10 ⬜ — Broadcasts
Session 11 ⬜ — Analytics + weekly reports
Session 12 ⬜ — Deploy to Render + Meta webhook setup
Session 13 ⬜ — Next.js dashboard (classmate's sessions)
```

---

## Session 2 Live Verification (2026-06-30)

Tested end-to-end against real Supabase + real Upstash Redis using a simulated Meta webhook (no real Meta App yet — `META_APP_SECRET` is a placeholder, signature computed manually with `openssl` to match).

**What was verified, with evidence:**

- `npm run migrate` runs clean against real Supabase — all 3 migrations already applied, skip logic confirmed working
- `npm run dev` starts cleanly — DB, Redis, and Bull queue all report connected
- `/health` endpoint returns `200 healthy` with all 3 services correctly reported — confirms `isQueueHealthy()` works against real Upstash
- `waitForDatabase()` retry logic confirmed: 5 attempts then clean `process.exit(1)` when DB unreachable (tested with bad fake DB URL before real one was used)
- Webhook signature verification (`verifyWebhookSignature`) confirmed working both ways: rejects invalid signatures (`401`), accepts valid HMAC-SHA256 signatures (`200`)
- Idempotency check confirmed working: resending the same `messageId` correctly logs "Webhook event already seen — skipping duplicate" and does not reprocess
- Tenant resolution via `wa_phone_number_id` confirmed working — correctly resolved a real test tenant row by phone_number_id match
- Bull job enqueue confirmed: `jobId = messageId` dedup pattern working, job data correctly populated
- **Bull job processor pickup confirmed working** — after fixing a real bug (see below), jobs are picked up and the stub completes within the same second as enqueue

**Real bugs found and fixed during live testing (not caught by static review):**

1. **`wa_account_id` column never existed in any migration** — `db/types.ts` declared it, TypeScript trusted it, `tsc --noEmit` passed, but the column was never created by SQL. Webhook controller's tenant resolution would have failed at runtime on every single real webhook. Fixed by switching to `wa_phone_number_id` (which does exist) sourced from `value.metadata.phone_number_id` in the Meta payload — also more architecturally correct since one WABA can hold multiple phone numbers. Fixed in `db/types.ts`, `controllers/webhook.controller.ts`, `services/queue.service.ts` (stale comment).
2. **`lazyConnect: true` on the Bull Redis config broke job processing on Upstash** — jobs enqueued successfully (producer connection activated on first `.add()` call) but were never picked up by the processor (consumer connection never properly initialized). Found via live testing: jobs sat in the queue with no pickup until a server restart, at which point Bull's stall-detection mechanism eventually recovered them — but new jobs sent after `lazyConnect` was removed processed instantly, confirming the fix. Removed in `services/queue.service.ts`.

**Still not verified (requires real Meta App credentials):**

- GET /webhook verification handshake against a real Meta dashboard
- A real inbound WhatsApp message from an actual phone, not a simulated curl payload
- Real Meta webhook retry behavior under actual network conditions

---

## Session 2 — What To Build

Files to create:

```
src/routes/webhook.routes.ts
src/controllers/webhook.controller.ts
src/services/queue.service.ts
src/jobs/message.processor.ts  (stub — full logic in Session 5)
```

Update `app.ts`:

```typescript
import webhookRouter from "./routes/webhook.routes.js";
import "./jobs/message.processor.js"; // registers Bull processor on startup
app.use("/webhook", webhookRouter); // express.raw() already set up for /webhook
```

Key things Session 2 must do:

1. GET /webhook — Meta verification handshake (echo hub.challenge if token matches)
2. POST /webhook — receive inbound messages
3. Verify Meta HMAC-SHA256 signature BEFORE touching body (use `verifyWebhookSignature` from whatsapp.service.ts)
4. Return 200 IMMEDIATELY, process async after response sent (Meta retries if > 20s)
5. Idempotency check via `webhook_events` table (event_id UNIQUE)
6. Resolve tenant from `wa_phone_number_id` (Meta's `value.metadata.phone_number_id`) — NOT `entry.id`/WABA ID, since one WABA can hold multiple phone numbers
7. Check tenant is active (`is_active` / `plan_status`)
8. Normalize phone number via `sanitizePhone()` from helpers.ts
9. Enqueue Bull job with `jobId: messageId` (second dedup layer)
10. Use type guards from whatsapp.service.ts to identify message type

Bull queue setup:

```typescript
// src/services/queue.service.ts
import Bull from "bull";
// Use config.upstash.redisUrl and config.upstash.redisToken
// Queue name: 'message-processing'
// Default: 3 retries, exponential backoff 2s
// removeOnComplete: 100, removeOnFail: 500
```

---

## Known Gaps & Technical Debt

### rateLimiter.middleware.ts

- [ ] **Session 6** — Add tenant-based rate limiting for authenticated routes (current IP-only limiting breaks for office teams sharing one IP)
- [ ] **Session 2** — Webhook limiter keys by IP, should key by WABA ID (webhooks come from Meta servers not end users)

### whatsapp.service.ts

- [ ] Media URL expiry hardcoded to 5 minutes — Meta doesn't document exact expiry. Download immediately in Session 5 instead of caching URL.
- [ ] `sendContactMessage` — no validation on contact field formats (name.formattedName required by Meta)
- [ ] Interactive list total row limit (10) may actually be 10 per section — verify against Meta docs in Session 10
- [ ] `downloadMedia` uses raw axios not `metaMediaApi` instance — intentional (URL already contains auth) but means no interceptors apply
- [ ] No internal retry — intentional, Bull handles retries at job level to avoid double-retry

### queue.service.ts — RESOLVED via live testing (2026-06-30)

- [x] ~~`lazyConnect: true` on Bull's Redis config broke job processing on Upstash~~ — FIXED. Producer connection (`.add()`) activated correctly but consumer connection (`.process()` blocking pop) never properly initialized. Jobs enqueued but were never picked up. Confirmed via live test: removing `lazyConnect` fixed pickup immediately (new jobs processed within the same second as enqueue). If touching Bull's Redis config again, do NOT re-add `lazyConnect` without re-testing job pickup specifically, not just connection status.

### Database schema edge cases

- [x] ~~RESOLVED~~ `wa_account_id` column referenced in `db/types.ts` and used for tenant resolution in `webhook.controller.ts` was NEVER created by any migration (001/002/003). TypeScript trusted `types.ts` blindly — `tsc --noEmit` passed despite the column not existing, and this would have failed at runtime on every real webhook. Found via live testing against real Supabase when the column wasn't visible in Table Editor. Fixed: tenant resolution now uses `wa_phone_number_id` (which exists) matched against `value.metadata.phone_number_id` from the Meta payload — also more architecturally correct since one WABA can hold multiple phone numbers, making phone_number_id the true unique identifier per tenant. **Lesson: types.ts is not a source of truth for the real schema — cross-check against migrations or the live DB when in doubt, especially before relying on a column for tenant-resolution logic.**
- [ ] **Session 5** — `messages.body NOT NULL` for media messages: convention = use empty string `''` for captionless media, never null
- [ ] **Session 2** — Normalize ALL phone numbers via `sanitizePhone()` before any DB insert or lookup (same person could create two contact rows as `971501234567` and `+971501234567`)
- [ ] **Session 5** — CRITICAL: Always derive `tenant_id` from the contact row in service layer, never trust caller-supplied `tenant_id`. Prevents cross-tenant data leak if application has a bug.
- [ ] **Session 6** — Set `trial_ends_at = NULL` for non-trial signups (paid plan from day 1). Prevent misleading stale value.
- [ ] **Session 6/7** — Enforce `plan_limits.agents_limit` before allowing new user invite
- [ ] **Session 6/7** — Validate `assigned_agent_id` belongs to same tenant before assigning contact
- [ ] **Session 9/12** — Add cleanup job for expired/used refresh tokens (`expires_at < NOW() - 30 days`)
- [ ] **Session 10** — Validate broadcast has `meta_template_name` before allowing status → `'sending'`
- [ ] **Session 10** — Add rate limiting between Meta API calls during broadcast (use `sleep()` from helpers.ts). Meta has per-second limits per phone number.
- [ ] **Later** — Decide on soft-delete vs hard-delete for tenants/contacts. Current: hard delete with CASCADE. UAE PDPL "right to be forgotten" may require documented deletion process.
- [ ] **Later (cron job)** — Suspend expired trials: `UPDATE tenants SET plan_status = 'suspended' WHERE plan_status = 'trial' AND trial_ends_at < NOW()`
- [ ] **Later** — `plan_limits` table has no `updated_at` trigger (inconsistency with other tables)

### utils/logger.ts

- [ ] **Session 6+** — Use `maskSensitive()` when logging objects that contain user data (currently exported but unused)
- [ ] **Later** — AsyncLocalStorage for automatic request ID propagation in all log calls (currently must pass `requestId` manually)

### types/express.d.ts

- [ ] **Session 6** — Decide: keep `TenantRecord`/`UserRecord`/`ContactRecord`/`MessageRecord` camelCase interfaces OR use Kysely `Selectable<T>` types directly. Currently both exist — duplication. Kysely types are snake_case (match DB). Express types are camelCase. A mapping layer is needed.

### claude.service.ts

- [ ] **Session 5 — CRITICAL** — Check `onboarding_progress.step_bot_configured` BEFORE calling `generateReply()`. If false, the tenant's `bot_config` is empty/default and Claude will respond with generic non-answers ("various services", "Assistant") to a real customer. Processor should instead notify the tenant's agent and/or send a holding message, not call Claude with an unconfigured bot.
- [ ] **Product gap — no session currently covers this** — No audio/voice transcription path exists anywhere in the 13-session plan. UAE WhatsApp customers commonly send voice notes. Currently `message_type: "audio"` reaches Claude as `[audio message — no text content]` — the bot replies blind to whatever the customer actually said. Needs a transcription step (e.g. Whisper API) inserted before `generateReply()` is called, likely in Session 5's processor or as a new dedicated step.
- [ ] Reply truncation (`MAX_REPLY_CHARS = 3500`) slices by character count — acceptable for English/Arabic but could land mid-sentence. Not a crash risk, just a cosmetic edge case if a model ever ignores the "under 300 words" instruction.

### Session 7 additions needed

- [ ] WebSockets (Socket.io) for real-time dashboard updates
    - Events: `new_message`, `message_status`, `hot_lead`, `broadcast_progress`, `new_notification`
    - Each tenant gets their own room: `tenant:{tenantId}`
    - Install: `npm install socket.io`

### Infrastructure

- [ ] Upstash Redis free tier deleted after 14 days inactivity. Once on Render (Session 12) server runs 24/7 — this won't recur. Until then, recreate if deleted.
- [ ] Supabase free tier pauses after 7 days inactivity. Already has Vercel cron job on the Dubai client project but Chatrix project needs its own protection.

---

## Claude AI Response Structure (for Session 3)

System prompt contains:

- Business description and services (from `tenants.bot_config`)
- Agent name and tone
- Safety rules (never invent prices, addresses, availability)
- Conversation summary (`contacts.conversation_summary`)
- Last 6 raw messages (from `messages` table)

Claude returns JSON:

```json
{
    "reply": "string — the message to send to the customer",
    "score": "hot | warm | cold | unknown",
    "score_reason": "string — why this score",
    "intent": "string — what the customer wants",
    "budget": "string | null",
    "timeline": "string | null",
    "urgency_signals": ["array of detected signals"],
    "update_summary": "string — new conversation summary to store"
}
```

---

## Message Processing Flow (for Session 5)

```
Meta webhook arrives
    ↓
POST /webhook (Session 2)
    ↓
verifyWebhookSignature() — reject if invalid
    ↓
res.status(200).send() — acknowledge immediately
    ↓
Check webhook_events for duplicate (idempotency)
    ↓
Resolve tenant from wa_phone_number_id
    ↓
Check tenant is active + within plan limits
    ↓
Enqueue Bull job (jobId = messageId for dedup)
    ↓
Bull worker picks up job (Session 5)
    ↓
Check contact opted_out — if true, skip entirely
    ↓
Upsert contact (create or update last_message_at, message_count)
    ↓
Store inbound message in messages table
    ↓
Cancel pending drip job if exists (contacts.drip_job_id)
    ↓
Load conversation summary + last 6 messages
    ↓
Call Claude AI service (Session 3)
    ↓
Run safety validator (Session 4)
    ↓
Send reply via sendTextMessage() or appropriate media function
    ↓
Store outbound message in messages table
    ↓
Update contact: score, intent, budget, timeline, urgency_signals, conversation_summary
    ↓
Increment tenants.conversations_used
    ↓
Create notification if hot lead detected
    ↓
Mark webhook_events.processed = true
    ↓
Enroll in drip sequence if applicable (Session 8)
```

---

## Important Patterns — Follow These Always

### 1. Never read process.env directly

```typescript
// ❌ Wrong
const key = process.env.ENCRYPTION_KEY;

// ✅ Correct
import { config } from "../config/index.js";
const key = config.encryption.key;
```

Exception: `logger.ts` — circular dependency with config, acceptable.

### 2. Always use Kysely for DB queries

```typescript
// ❌ Wrong — untyped
const result = await query("SELECT * FROM contacts WHERE id = $1", [id]);

// ✅ Correct — fully typed
const contact = await db
    .selectFrom("contacts")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
```

### 3. Always sanitize phone numbers before DB operations

```typescript
import { sanitizePhone } from "../utils/helpers.js";
const phone = sanitizePhone(rawPhone); // before every insert or lookup
```

### 4. Always validate UUID params before DB lookup

```typescript
import { isValidUUID } from "../utils/helpers.js";
if (!isValidUUID(req.params.id)) throw new NotFoundError("Contact not found");
```

### 5. Derive tenant_id from contact, never trust caller

```typescript
// ❌ Wrong — trusts caller-supplied tenantId
await db.insertInto('messages').values({ tenant_id: req.body.tenantId, ... })

// ✅ Correct — derive from contact
const contact = await db.selectFrom('contacts').where('id', '=', contactId).executeTakeFirst()
if (!contact) throw new NotFoundError()
// Now use contact.tenant_id — guaranteed correct
```

### 6. Always check opted_out before sending

```typescript
if (contact.opted_out) {
    logger.info("Skipping message — contact opted out", {
        contactId: contact.id,
    });
    return;
}
```

### 7. Throw typed errors, never res.status() directly in controllers

```typescript
// ❌ Wrong
res.status(404).json({ error: "Not found" });

// ✅ Correct — global error handler in app.ts catches this
throw new NotFoundError("Contact not found");
```

### 8. Use successResponse / paginatedResponse for consistency

```typescript
import { successResponse, paginatedResponse } from "../utils/helpers.js";
res.json(successResponse(contact, "Contact retrieved"));
res.json(paginatedResponse(contacts, page, limit, total));
```

---

## Dependencies — Full List

### Production

```json
{
    "@anthropic-ai/sdk": "^0.39.0",
    "@upstash/ratelimit": "^2.0.8",
    "@upstash/redis": "^1.34.3",
    "axios": "^1.9.0",
    "bcryptjs": "^2.4.3",
    "bull": "^4.16.5",
    "cors": "^2.8.5",
    "dotenv": "^16.5.0",
    "express": "^4.21.2",
    "express-async-errors": "^3.1.1",
    "express-rate-limit": "^8.5.2",
    "form-data": "^4.x",
    "helmet": "^8.0.0",
    "hpp": "^0.2.3",
    "jsonwebtoken": "^9.0.2",
    "kysely": "^0.29.2",
    "pg": "^8.14.1",
    "redlock": "^4.2.0",
    "uuid": "^11.1.1",
    "winston": "^3.17.0",
    "zod": "^3.24.3"
}
```

### Dev

```json
{
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/form-data": "^2.x",
    "@types/hpp": "^0.2.6",
    "@types/jsonwebtoken": "^9.0.9",
    "@types/node": "^22.15.3",
    "@types/pg": "^8.11.11",
    "@types/uuid": "^10.0.0",
    "rimraf": "^6.0.1",
    "tsx": "^4.19.3",
    "typescript": "^5.8.3"
}
```

### npm overrides (package.json)

```json
"overrides": {
  "bull": { "uuid": "^11.1.1" }
}
```

### To add in Session 7

```bash
npm install socket.io
```

---

## Scripts

```bash
npm run dev      # tsx watch src/app.ts — development with hot reload
npm run build    # rimraf dist && tsc — clean build
npm start        # node dist/app.js — production
npm run migrate  # tsx src/db/migrate.ts — run pending migrations
npm run lint:types  # tsc --noEmit — TypeScript check (0 errors currently)
```

---

## TypeScript Config Highlights

- `strict: true` — all strict checks enabled
- `noUncheckedIndexedAccess: true` — array[i] returns T | undefined (catches real bugs)
- `exactOptionalPropertyTypes: true` — optional means absent, not undefined
- `noUnusedLocals/Parameters: true` — dead code caught at compile time
- `noImplicitReturns: true` — all code paths must return
- `target: ES2022, module: NodeNext` — modern Node native ESM
- All imports must use `.js` extensions even for `.ts` files

---

## Current State — Everything Working

```
✅ npm run lint:types → 0 errors
✅ npm run dev → server starts, DB connected
✅ npm run migrate → all 3 migrations applied, skip logic works
✅ npm audit → 0 vulnerabilities
⚠️  Redis: recreated June 27 (was deleted after inactivity) — update .env with new credentials
```

---

## How To Use This Document

1. Paste at the start of every new Claude session
2. State which session you are starting: "Starting Session 2"
3. Claude has full context immediately — no re-explanation needed
4. At end of each session, update the progress tracker and known gaps

---

## Progress Tracker

```
Session 1  ✅ Complete — Foundation, DB, security, types, migrations, full WhatsApp service. LIVE VERIFIED 2026-06-30.
Session 2  ✅ Complete — WhatsApp webhook receiver, Bull queue, processor stub. LIVE VERIFIED end-to-end 2026-06-30 against real Supabase + Upstash (see "Session 2 Live Verification" section above). 2 real runtime bugs found and fixed during live testing (wa_account_id phantom column, Bull lazyConnect breaking job pickup) — neither was catchable by static review or tsc.
Session 3  🟡 In progress — claude.service.ts built + reviewed (9 static issues fixed). NOT yet live-tested — blocked on real ANTHROPIC_API_KEY (not yet generated).
Session 4  ⬜ Not started — Safety validator
Session 5  ⬜ Not started — Message processor Bull job
Session 6  ⬜ Not started — Auth (signup, login, JWT, refresh tokens)
Session 7  ⬜ Not started — Contacts + messages API routes
Session 8  ⬜ Not started — Drip system
Session 9  ⬜ Not started — Billing (Stripe)
Session 10 ⬜ Not started — Broadcasts
Session 11 ⬜ Not started — Analytics + weekly reports
Session 12 ⬜ Not started — Deploy to Render + Meta webhook setup
Session 13 ⬜ Not started — Next.js dashboard (classmate)
```

## ⚠️ Rules For Claude Reading This Document

1. Follow ALL patterns in this document exactly — they were deliberately chosen
2. Do NOT suggest changing Session code unless there is a clear bug
3. Do NOT introduce packages not already in package.json without asking first
4. Do NOT deviate from the folder structure shown
5. If something seems wrong, FLAG IT as a note but build the established way
6. Ask before any architectural decision not covered here
7. The naming conventions, error patterns, config patterns, DB patterns
   are all intentional — do not "improve" them unilaterally
8. The very important rule is always think properly, think of all edge cases and
   generate high prodction grade code. Do not dump all code at one. Generate one file at each time
   sequentially and explain the file properly with pros and cons and its necessities thoroughly.
