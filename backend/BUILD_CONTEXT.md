# 🚀 Chatrix — Complete Build Context

> Paste this at the start of every new Claude session. No need to re-explain anything.
> Last updated: Session 1 Review Complete — June 27, 2026

---

## Product

WhatsApp AI SaaS. Any business signs up, connects their WhatsApp number, gets an AI bot that handles enquiries 24/7, qualifies leads, books appointments, sends follow-up drip messages. Targets UAE market. Generic — works for any business type (real estate, clinic, salon, gym, restaurant, law firm, etc).

---

## Competitive Landscape (added after Meta Business Agent launch, Aug 2026)

Meta launched a native "Meta Business Agent" globally June 3, 2026 — AI that answers questions, qualifies leads, books appointments, activatable directly in the WhatsApp Business app, no coding, no third-party subscription. Token billing for the API tier started Aug 1, 2026 (~$2/1M tokens, ~4-5 cents/message, no markup). This means "AI that answers WhatsApp messages 24/7" is no longer a differentiator on its own — Meta gives that away near-cost.

**Confirmed gap Chatrix still fills:** Meta's native agent has no CRM integrations (Salesforce, HubSpot), no MCP support, no integration marketplace, can't read/write external systems (CRM/ERP/Shopify) in its self-serve tier.

**What Chatrix actually sells now, in priority order:**
1. Predictable flat pricing (AED 149/299/599) vs. Meta's per-message billing with no floor
2. Business-type-specific safety guardrails (`safety.service.ts`'s 8 checks) — tailored, not generic
3. Integrations to a client's other tools — the confirmed gap in Meta's own offering
4. Multi-agent team collaboration (Session 13) — Meta's native tool targets solo/small operators
5. A real person behind it — personal onboarding/support, not a self-serve app screen

**Strategy vs. DoubleTick/Wati-style competitors:** stay generic across business types (matches existing architecture — `business_type` field, flexible `bot_config` JSONB, configurable `safetyRules` per tenant, all already built this way). Differentiation comes from configuration quality per client, not from narrowing to one vertical — a well-configured `bot_config` and tailored safety rules should make each client's bot feel purpose-built for their business, even on a shared, generic platform. Win on price and flexibility for small single-operator businesses across any industry, underserved by DoubleTick's team-oriented pricing and Meta's one-size-fits-all native agent.

**Practical consequence:** session build order (below) is unchanged — this only changes how Chatrix gets pitched to real clients in Track C of the roadmap, and pulls basic outbound-webhook integration hooks earlier in priority (see Session 7/10 note).

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
│   │   ├── claude.service.ts              🟡 complete (built + reviewed, not live-tested)
│   │   ├── crypto.service.ts              ✅ complete
│   │   ├── queue.service.ts               ✅ complete (LIVE VERIFIED)
│   │   ├── safety.service.ts              ✅ complete (LIVE VERIFIED — 49/49 tests)
│   │   └── whatsapp.service.ts            ✅ complete (all media functions added)
│   ├── types/
│   │   ├── environment.d.ts               ✅ complete
│   │   └── express.d.ts                   ✅ complete
│   ├── utils/
│   │   ├── errors.ts                      ✅ complete
│   │   ├── helpers.ts                     ✅ complete
│   │   └── logger.ts                      ✅ complete
│   ├── controllers/
│   │   └── webhook.controller.ts          ✅ complete (LIVE VERIFIED)
│   ├── jobs/
│   │   └── message.processor.ts           ✅ stub complete (LIVE VERIFIED — full logic Session 5)
│   ├── routes/
│   │   └── webhook.routes.ts              ✅ complete
│   └── validators/
│       └── auth.validator.ts              ✅ complete
├── scripts/
│   ├── test-claude-service.ts             🟡 ready to run (needs real ANTHROPIC_API_KEY)
│   └── test-safety-service.ts             ✅ LIVE VERIFIED — 49/49 passing 2026-07-02
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
Known limit — stated explicitly so it isn't assumed to be a complete solution: rotation only protects against the scenario where an attacker's stolen copy and the real user's copy are both still in use, competing — whichever one refreshes first invalidates the other. If an attacker gains exclusive, ongoing possession of both tokens (the real user never uses their copies again), rotation does nothing — the attacker can refresh indefinitely, extending access forever, indistinguishable from the real user by the token mechanism alone. This is not a bug specific to this implementation; it's an inherent limit of bearer-token authentication generally. Mitigating this requires the two additional mechanisms below (absolute session lifetime, anomaly detection) — rotation alone is not sufficient for this scenario.

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

### 15. Token storage — HttpOnly cookies, decided and implemented in Session 6

Access and refresh tokens are set by the Session 6 auth controller as HttpOnly; Secure; SameSite=Strict cookies (res.cookie(...)), not returned in the JSON response body as plain strings for the frontend to store manually. This is a Session 6 implementation decision — documented here specifically so Session 13 (frontend, built separately) doesn't need to guess it from reading controller code.

Why: HttpOnly means client-side JavaScript cannot read the cookie under any circumstance — even a successful XSS injection on the dashboard (the most realistic token-theft path identified for this product, since customer-controlled text like contact names flows into admin-facing UI) gets nothing, because there is nothing exposed to steal. The alternative (returning tokens in the JSON body for localStorage/manual header attachment) would let any injected script read the token directly via localStorage.getItem(...).

Trade-off this requires: cookies are attached to requests automatically by the browser, which introduces CSRF exposure that a Bearer-token-in-header approach doesn't have. SameSite=Strict closes this for Chatrix's current setup (first-party dashboard + own API, no cross-site embedding use case) — this flag is not optional, it's required for the cookie approach to actually be safe, not just convenient.

Consequence for Session 13: the frontend must use credentials: 'include' on fetch/axios calls and must NOT attempt to read a token from the response body or manually attach an Authorization header — there is no token exposed to the frontend to attach. app.ts's CORS config already anticipates this (credentials: true is already set) — no backend rework needed there.

Future note, not current scope: if Chatrix ever exposes a public API for third-party developer integrations, that use case cannot use cookies (cookies are a browser-only concept) and would need Bearer-token auth as a separate, additional mechanism alongside the dashboard's cookie-based auth — not a replacement for it. Not a decision needed now; flagged so it isn't a surprise later.

### 16. Absolute session lifetime cap (Session 6 decision, not yet built)

JWT_REFRESH_EXPIRY=7d is currently a sliding window — each rotation resets the clock to a fresh 7 days from that refresh, meaning continuous use (legitimate or by an attacker with exclusive token possession) could theoretically extend a session indefinitely with no forced re-authentication ever occurring. This needs a separate, independent cap: track the original login timestamp per session chain (e.g. a session_started_at column on the first refresh_tokens row of a chain, carried forward through each rotation), and reject refresh attempts past a fixed ceiling — e.g. 30 days from original login — regardless of how recently the token was last rotated. This forces periodic full re-authentication (password re-entry) that no amount of refreshing can bypass. Not yet built — needs to be a concrete Session 6 task, not assumed to already exist because rotation exists.

### 17. Bot assignment — per-conversation ON/OFF switch, business-controlled, no automatic timers

Every contact has `bot_assigned: boolean` (default `true`). When `true`, Claude handles inbound messages normally, with no added delay. When `false`, the bot never processes that conversation at all — inbound messages are stored and a notification is raised, but Claude is never called.

**Why this design, and what was rejected:** an earlier design considered (a) a short delay before every bot reply to give a human a window to intercept, and (b) automatic bot resumption after a period of human inactivity. Both were rejected: (a) because it would slow down every single reply, for every tenant, to protect against a rare race condition; (b) because auto-resuming risks the bot re-engaging while a human still considers themselves responsible for the conversation, with no reliable signal that they're actually done. `bot_assigned` only ever changes through an explicit action — never a timer, never an automatic trigger. This keeps the bot at full speed for the overwhelming majority of conversations where no human is involved, while giving businesses complete, explicit control when they want it.

**What flips it to `false` automatically (system-triggered, not requiring a manual click):**
- Claude's structured output includes `humanRequested: boolean` for the current message. If `true`, `bot_assigned` flips to `false` immediately, in the same processing pass — no delay, no dependency on the customer sending another message.
- A deterministic keyword/phrase check (configurable per tenant, e.g. `["talk to a person", "human agent", "real person"]`) runs on every inbound message *before* Claude is even called, as an independent, non-AI safety net against Claude failing to detect an unusually-phrased request.
- Interactive button tap, where the customer explicitly selects a "Talk to an Agent"-style option (via `sendInteractiveButtons`, already built in `whatsapp.service.ts`). This is the most reliable of the three detection methods — unlike Claude's judgment or the keyword check, it involves no language interpretation at all: the customer's tap returns a fixed `button_reply.id` (e.g. `"talk_to_agent"`) that the processor checks directly, bypassing Claude entirely for that message. A "send a voice recording" button option was considered and rejected — a button can only report back which option was tapped, it cannot trigger microphone recording on the customer's device, which WhatsApp does not expose to businesses; the customer can already send a voice note at any time without prompting.
- The moment any human staff member sends a manual reply to a contact (`messages.ai_generated = false`), `bot_assigned` flips to `false` automatically for that contact — a human replying is itself the strongest possible signal they're taking over.

**What flips it back to `true`:** only an explicit action by a staff member in the dashboard. No automatic resume, ever, at any interval.

**Per-tenant defaults:** `tenants.bot_config.defaultBotAssignment: boolean` controls whether *new* contacts start with the bot on or off, set by each business per their own workflow preference.

**When to offer interactive buttons at all — Claude decides, not fixed code rules.** Claude's structured response includes an additional field, `suggestButtons: string[] | null` (max 3 short option strings, or `null`). The system prompt instructs Claude to populate this only at a genuine conversational decision point (e.g. availability just confirmed, pricing discussed, customer seems ready for a next step) — not on routine back-and-forth, simple factual answers, or early-conversation exchanges. If `suggestButtons` is non-null, the processor calls `sendInteractiveButtons` with those options instead of a plain text send; if `null`, a normal text reply is sent. This mirrors how `score`/`intent`/`urgency_signals` are already Claude-judged rather than rule-based, and is an acceptable, non-deterministic tradeoff for *when* to show buttons — separate from and independent of the fully deterministic tap-detection logic above, which is what actually matters for reliably triggering handoff.

### 18. Conversation summary generation — delayed by exactly one turn, never same-call

`contacts.conversation_summary` is never written in the same Claude call that produces the current reply. Instead, each call writes a summary of the *previous* turn's exchange — which by that point has already passed through the safety check and reflects the real, final message that was actually sent — never Claude's original, possibly-modified-or-blocked draft.

**Why:** the safety check runs *after* Claude produces a reply, and can modify or block it. If Claude summarized its own reply in the same call, the summary could describe something that was never actually sent to the customer (e.g. summarizing an invented price the safety layer then blocked). Delaying the summary by one turn guarantees it only ever describes finalized, real history.

**What is NOT delayed, and never has been:** the current inbound message (always live) and the last 6 raw messages (always fetched fresh from `messages`, always accurate regardless of summary timing). Any real-time decision — including human handoff detection — is made from these, never from the summary. The summary exists purely to compress older history beyond the 6-message window; it plays no role in the bot's ability to respond correctly to what's happening right now.

**Exception — immediate re-summarization on bot re-assignment:** if a human has handled a contact for multiple messages (potentially far more than 6) before flipping `bot_assigned` back to `true`, the normal one-turn-delayed mechanism is insufficient — the last 6 raw messages could be low-information (quick acknowledgments) and the delayed summary may not have captured the human-handled stretch at all. The moment `bot_assigned` flips back to `true`, trigger one dedicated Claude call summarizing everything since it was last set to `false`, and write it immediately — before the bot's next reply, not on the normal one-turn delay. Debounce this by ~60 seconds after the flip (only fire if still `true` at that point) to avoid wasted calls during rapid on/off toggling.

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
Session 4  ✅ — Safety validator (LIVE VERIFIED 2026-07-02 — 49/49 tests passing, zero cost, no external APIs)
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

## Session 6 — Auth Security Checklist (Manual Pass Before Marking Complete)

This is a one-time, concrete checklist — not an ongoing habit like the section above. Run through it once Session 6's auth code is built, before marking the session ✅ complete. Several items here are already implied by existing architecture decisions (Refresh token rotation, Per-tenant email uniqueness) — this checklist makes them explicit and testable rather than just described in prose.

**Password handling**
- [ ] Confirm bcrypt cost factor is explicitly set (don't rely on library default silently) — 10-12 rounds is the current reasonable baseline; document whichever is chosen and why.
- [ ] Confirm `passwordSchema`'s 72-char max is enforced server-side, not just documented — bcrypt silently truncates beyond 72 bytes, so a longer password would appear to "work" at signup but fail confusingly at login if truncation happens inconsistently.
- [ ] Confirm password reset tokens are single-use and time-limited, and that requesting a reset doesn't reveal whether the email exists in the system (avoid user enumeration via response timing or message differences).

**JWT specifics**
- [ ] Confirm `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are genuinely different values, not the same secret reused — a leaked access token secret should not also compromise refresh tokens.
- [ ] Confirm the JWT payload (`userId`, `tenantId`, `role`, `email`) contains nothing more sensitive than necessary — JWTs are base64-encoded, not encrypted; anyone holding a token can read its payload.
- [ ] Confirm expired/invalid JWT verification failures return a generic 401, not a message distinguishing "expired" vs "invalid signature" vs "malformed" — that distinction is only useful to an attacker probing the system.
- [ ] Confirm `role` in the JWT is checked server-side on every protected route, not just used to conditionally render UI on the frontend later (Session 13). A JWT with a tampered role claim should fail signature verification, but this is worth a deliberate test, not an assumption.

**Refresh token rotation (validates the design already documented above)**
- [ ] Live-test that reusing an already-rotated (invalidated) refresh token is rejected — this is the actual security property refresh rotation exists for; test it directly rather than trusting the code reads correctly.
- [ ] Confirm refresh tokens are stored as bcrypt hashes in `refresh_tokens` (per existing design), never in plaintext, and confirm a DB read of that table wouldn't yield usable tokens directly.
- [ ] Confirm logout invalidates the specific device's refresh token, and decide/document whether "logout everywhere" (invalidate all rows for a user) is in scope for Session 6 or deferred.
- [ ] Confirm a maximum total session lifetime is enforced independently of rotation (see Key Architecture Decision #16) — a refresh chain that's been continuously renewed must still eventually force a real password re-login, not refresh forever.
- [ ] Decide and document the actual ceiling (30 days suggested as a starting point) — this is a product/UX tradeoff (security vs. how often users tolerate re-login), not a fixed correct number — make the call deliberately.

**Anomaly signals (basic, Session 6/7 — not full fraud detection, just cheap first signals)**
- [ ] Log IP address on every login and every refresh to audit_logs (already flagged in Addition 2 from the earlier batch  confirming it's actually wired in, not just planned).
- [ ] Consider flagging (not necessarily blocking) a refresh from an IP/country materially different from the account's recent pattern — "impossible travel" style detection. Flag as a decision to make consciously about scope for Session 6 vs. deferring to a later session; not required to ship a full detection system now, but the audit log data needs to exist from Session 6 onward so this is buildable later without a data-collection gap.
- [ ] Consider requiring fresh password confirmation (not just a valid token) before high-sensitivity actions specifically (bulk export, billing change, tenant deletion) — a deliberate "step-up auth" decision, separate from normal session validity.

**Cross-tenant isolation at the auth layer specifically**
- [ ] Confirm login with a valid email/password but wrong `tenantId` (for multi-tenant users) is rejected, not silently logged into the wrong tenant context.
- [ ] Confirm the auth middleware populates `req.tenant` and `req.currentUser` from the DB using the JWT's `tenantId`/`userId` — never trusts a tenant ID passed in the request body/query on an authenticated route (same principle as "derive tenant_id from contact, never trust caller," applied to auth specifically).

**Rate limiting on auth routes**
- [ ] Confirm `authLimiter` (5/15min) actually applies to login, signup, and password-reset-request routes specifically — not just generically mounted at `/api/auth/` and assumed to cover everything added later.
- [ ] Consider whether login failures should be tracked per-account (not just per-IP) to prevent distributed brute-force attempts against one specific email from many IPs — flag as a decision to make consciously, not a requirement to necessarily build now.

**Cookie configuration (see Key Architecture Decision #15)**
- [ ] Confirm both access and refresh token cookies are set with `httpOnly: true`, `secure: true`, `sameSite: "strict"` — all three flags, not just `httpOnly` alone. Missing `secure` allows transmission over plain HTTP; missing/weak `sameSite` reopens CSRF exposure that `httpOnly` alone does not address.
- [ ] Confirm login/refresh responses do NOT also include the raw token string in the JSON body "just in case" — doing so defeats the purpose of `httpOnly`, since anything in the JSON body is readable by JavaScript regardless of the cookie flags.
- [ ] Confirm logout clears the cookie server-side (`res.clearCookie(...)`) in addition to invalidating the refresh token row in the database — clearing only one of the two leaves either a dead cookie the browser still holds, or a live cookie pointing to a revoked token.

**Logging**
- [ ] Confirm `maskSensitive()` (currently exported but unused — see ongoing hygiene section) is wired into any logging call in the new auth code that logs request bodies or user objects, so passwords/tokens never land in logs even accidentally.

---

### Bot assignment & handoff — build checklist by session

| Session | What it needs to add, specific to this design |
|---|---|
| **Session 5** (message processor) | `bot_assigned` gate check (before calling Claude); keyword-based handoff detection; `humanRequested` handling from Claude's structured output; second `bot_assigned` check before sending the finalized reply; one-turn-delayed summary logic; immediate re-summarization + debounce on reassignment; `conversations_used` increments only on real Claude calls ; interactive button send + button-tap detection (bypasses Claude for the `talk_to_agent` button ID); handling Claude's `suggestButtons` field to decide plain-text vs. interactive-button send |
| **Session 3 / claude.service.ts** | Add `humanRequested: boolean` and `suggestButtons: string[] | null` to the expected structured JSON output schema; add the button-timing instruction to the system prompt |
| **Session 7** | Notification fallback logic (broadcast when no `assigned_agent_id`); WebSocket/real-time layer (already flagged) — needed for the two-agents-simultaneously edge case |
| **Session 13** (dashboard) | Per-conversation `bot_assigned` toggle (manual ON/OFF); tenant-wide `defaultBotAssignment` setting in business settings; live "agent viewing" indicator (depends on Session 7's WebSocket work); clear visual signal when a chat is bot-off and waiting on a human |

---

## Known Gaps & Technical Debt

### jobs/message.processor.ts

- [x] ~~Stale comment referenced `lazyConnect: true` as the reconnection mechanism~~ — FIXED. That setting was removed (see `queue.service.ts` Known Gaps — `lazyConnect` broke job pickup on Upstash and was deliberately removed). The comment near the `messageQueue.process(5, processMessage)` try/catch was never updated after that fix and incorrectly implied `lazyConnect` was still active. Corrected to reference ioredis's own built-in reconnection behavior instead.
- [ ] **Session 5 — CRITICAL — retry-aware idempotency within the processing pipeline itself, not just at the webhook layer.** If a job fails partway through (e.g. after the WhatsApp reply was successfully sent, but before the job completes/marks success), Bull's retry mechanism re-runs the entire job from scratch on the next attempt — including re-sending the reply, causing the customer to receive a duplicate message. This is a distinct risk from the webhook-level `webhook_events`/`jobId` dedup already in place, which only prevents the *same inbound message* from being processed twice — it does not prevent a *retry of one already-in-progress job* from re-sending an outbound reply. Session 5 must check `job.attemptsMade` and/or check whether an outbound message row already exists for this `messageId` before calling `sendTextMessage()` (or the relevant media variant), and skip re-sending if so — while still completing any remaining steps (updating contact score, marking `webhook_events.processed`, etc.) that may not have finished before the failure.

### Bot assignment — database changes needed (Session 5/13)

- [ ] **`contacts.bot_assigned: BOOLEAN NOT NULL DEFAULT true`** — new column, new migration.
- [ ] **`tenants.bot_config` — add `defaultBotAssignment: boolean` and `humanHandoffKeywords: string[]`** — no migration needed, JSONB, but document the expected shape.
- [ ] **Confirm `notifications.notification_type` supports a human-handoff-specific type** (or reuse `hot_lead` — decide explicitly, don't leave implicit).
- [ ] **`conversations_used` increments ONLY on genuine Claude API calls — never for human-sent (`ai_generated: false`) messages.** This counter tracks Chatrix's own AI cost against plan limits; a human typing a reply has zero Claude cost and must not consume a tenant's bot-usage allowance. Meta's own per-message charges to the client are entirely separate and happen regardless of who composed the message — Chatrix has no visibility into or control over that side (see Decision #10).

### Bot assignment — edge cases (Session 5/7/13)

- [ ] **Two staff members acting on the same conversation simultaneously.** No current mechanism shows one agent that another is already viewing/handling a chat. **Fix requires the real-time layer** (WebSockets/Socket.io, already flagged under "Session 7 additions needed") — a live "X is viewing this conversation" indicator. Not solvable at the database level alone.
- [ ] **Race condition: a human replies while Claude is already mid-processing the same inbound message.** The initial `bot_assigned` check (before calling Claude) can pass, then a human takes over during Claude's processing, before the bot's reply is sent. **Fix:** re-check `contact.bot_assigned` a second time, immediately before sending the finalized reply (after the safety check, right before the Meta API call) — cheap, one extra DB read, closes the window to a few milliseconds.
- [ ] **Claude fails to detect an unusually-phrased human request** (e.g. "can I just talk to someone" vs. expected phrasing). **Fix:** the deterministic keyword check in Decision #17 runs independently of Claude's own judgment — two independent detection layers, not reliant on AI interpretation alone.
- [ ] **No `assigned_agent_id` exists when a handoff notification needs to go somewhere.** **Fix:** if `assigned_agent_id` is `null`, broadcast the notification to all active agents at that tenant; whoever claims it becomes the `assigned_agent_id` at that point, rather than assignment being a prerequisite for notification.
- [ ] **Bot must never auto-resume while a human still considers themselves responsible.** Already prevented by design (Decision #17 — no automatic timers) — flagged here as a hard rule to protect during any future "optimization," not an open gap.
- [ ] **The immediate re-summarization call (Decision #18's exception) can itself fail.** **Fix:** wrap in try/catch; on failure, fall back to a simple non-AI concatenation of the raw human-handled messages as a temporary summary, and let the next normal turn refine it. Never block the bot from resuming because a summary call failed.
- [ ] **Rapid `bot_assigned` toggling could trigger repeated, wasted re-summarization calls.** **Fix:** debounce ~60 seconds after flipping to `true`, only firing if still `true` at that point (see Decision #18).

### Cost/margin protection (Session 7/9 — flagged during pricing review)

- [ ] **Pro tier's `conversations_limit` still `99999` (effectively unlimited) — needs changing to a real calibrated cap (18,000/month suggested) before Pro tier goes live to any real client.** With no real ceiling, a genuinely heavy Pro client's actual Claude API cost could exceed the flat AED 599 they pay. 18,000/month is generous enough no realistic client hits it, while still protecting margin if one somehow did. **Action needed:** update the `plan_limits` seed row in `001_init.sql` (if not yet run against real Supabase) or via a direct `UPDATE` statement (if it has). Also confirm Session 6/7's plan-limit enforcement actually checks this value before calling Claude, not just before allowing a new conversation to start. Do this at whichever session first wires up `plan_limits` enforcement (Session 6/7) — don't ship Pro tier to a real client before this is done.
- [ ] **No per-tenant Claude cost tracking exists yet.** Needed to catch a margin problem before it's a real loss. Suggest a running cost counter (new `tenants` column, or a separate usage-log table), updated on every Claude API call in the message processor.
- [ ] **No per-contact message-frequency check exists.** One phone number sending an abnormal volume in a short window (spam, broken integration, abuse) currently triggers a full Claude call every time, with no throttle below the tenant-level `plan_limits` check.
- [ ] **No monitoring of aggregate Anthropic API usage against account-wide rate limits**, which are shared across every tenant. One tenant's volume spike could degrade requests for every other tenant. Proactively request a rate limit increase from Anthropic once real usage grows.
- [ ] **Session 7/10 — basic outbound webhook mechanism** (generic "notify external URL when X happens" — new contact, hot lead, conversation summary updated) prioritized earlier than originally planned, given confirmed integration gap in Meta's native agent (see Competitive Landscape section above).

### rateLimiter.middleware.ts

- [ ] **Session 6** — Add tenant-based rate limiting for authenticated routes (current IP-only limiting breaks for office teams sharing one IP)
- [ ] **Session 2** — Webhook limiter keys by IP, should key by WABA ID (webhooks come from Meta servers not end users)

### whatsapp.service.ts

- [ ] Media URL expiry hardcoded to 5 minutes — Meta doesn't document exact expiry. Download immediately in Session 5 instead of caching URL.
- [ ] `sendContactMessage` — no validation on contact field formats (name.formattedName required by Meta)
- [ ] Interactive list total row limit (10) may actually be 10 per section — verify against Meta docs in Session 10
- [ ] `downloadMedia` uses raw axios not `metaMediaApi` instance — intentional (URL already contains auth) but means no interceptors apply
- [ ] No internal retry — intentional, Bull handles retries at job level to avoid double-retry

### Meta daily messaging tier (distinct from Chatrix's own plan_limits — Session 5/10)

This is a completely separate limit from anything Chatrix itself enforces via `plan_limits`. Meta caps how many **unique recipients** a business can message **outside** a customer-service window (i.e. broadcasts and drip follow-ups only) within a rolling 24-hour period. Service replies — the bot answering a customer who messaged first — never count toward this limit at all, regardless of volume.

**The tier ladder:** 250 (unverified) → 1,000 (post-verification) → 10,000 → 100,000 → custom/unlimited. Tiers are earned automatically by Meta, not purchased or requested — advancement requires messaging roughly half the current tier's limit in unique recipients within a rolling 7-day window, while maintaining a Green or Yellow quality rating (checked every 6 hours). A Red quality rating (driven by recipient blocks/spam reports) freezes advancement, and only triggers an actual tier downgrade if it stays Red for 7 consecutive days.

**Why this matters for Chatrix specifically:**
- [ ] **Product gap, no session currently covers this** — nothing in the schema currently tracks a tenant's actual Meta-assigned messaging tier. A freshly onboarded tenant starts at 250/day (or 1,000 post-verification) regardless of which Chatrix plan they're paying for — a Pro-tier client could still get capped well below their `plan_limits.conversations_limit` in their first weeks, purely because their WABA hasn't built tier history yet. This is a real gap between what Chatrix's pricing implies and what Meta's infrastructure actually allows on day one.
- [ ] **Session 5/10 — add a `tenants.meta_messaging_tier` column** (or similar), populated via `GET /<phone_number_id>?fields=whatsapp_business_manager_messaging_limit` and kept in sync via the `business_capability_update` webhook Meta sends automatically when a tier changes, rather than polling.
- [ ] **Session 5/10 — handle Meta's tier-limit-exceeded error gracefully in the message processor and broadcast sender**, distinct from a generic send failure — surface it to the tenant's dashboard as "you've reached today's outreach limit for new contacts" rather than a silent/generic error, since this is a recoverable, expected condition as a business scales, not a bug.
- [ ] **Verify during actual Meta Tech Provider onboarding, don't assume** — since each tenant connects their own separate WABA under their own Business Portfolio via Embedded Signup (not a shared Chatrix-wide portfolio), tiers should be isolated per-tenant — one tenant's poor-quality broadcast should not affect another tenant's tier. This is the expected behavior given how Embedded Signup scopes access, but has not been confirmed against a real multi-tenant setup yet, and is worth explicitly testing with two real connected tenants before relying on it as a guarantee.
- [ ] **Distinct from, and in addition to, the already-flagged Session 10 item** — this daily *volume* tier is separate from the per-second *throughput* rate limit already noted in Known Gaps (`Add rate limiting between Meta API calls during broadcast`), and both are separate again from Meta's per-user frequency cap (~2 marketing messages/recipient/day, enforced across all WhatsApp businesses, not just Chatrix tenants — returns error code 131049, not billed if blocked for this reason). Three distinct mechanisms; each needs its own handling.

### queue.service.ts — RESOLVED via live testing (2026-06-30)

- [x] ~~`lazyConnect: true` on Bull's Redis config broke job processing on Upstash~~ — FIXED. Producer connection (`.add()`) activated correctly but consumer connection (`.process()` blocking pop) never properly initialized. Jobs enqueued but were never picked up. Confirmed via live test: removing `lazyConnect` fixed pickup immediately (new jobs processed within the same second as enqueue). If touching Bull's Redis config again, do NOT re-add `lazyConnect` without re-testing job pickup specifically, not just connection status.

### queue.service.ts — enqueueMessage duplicate-detection heuristic

- [ ] **`isDuplicate` in `enqueueMessage` is a logging-accuracy heuristic only — it does not control actual dedup.** It infers "was this job just created, or did Bull return a pre-existing one?" by checking whether `Date.now() - job.timestamp > 2000` (assuming a genuinely new job's timestamp is essentially "now"). Under unusual network conditions (a slow Redis round-trip, e.g. during a connection blip similar to the `read ETIMEDOUT` idle-timeout issue already observed), a genuinely brand-new job could theoretically take longer than 2 seconds to complete its `.add()` call, causing this heuristic to incorrectly log "already queued — skipping duplicate" for a message that was not actually a duplicate. **Confirmed this does NOT affect actual processing** — `messageQueue.add(data, { jobId })` always returns a valid job either way (`return job;` runs regardless of the `isDuplicate` branch), so a false positive here only produces a misleading log line, never a lost or skipped message. Low priority — cosmetic/observability accuracy only, not a correctness bug. If tightening this matters later, checking `webhook_events` directly (already the durable, primary dedup layer) instead of inferring from a timestamp gap would remove the ambiguity entirely.
- [ ] **Bull's `jobId` dedup (the actual mechanism preventing duplicate processing) has a real time boundary, worth being explicit about.** It only protects against a duplicate arriving while the original job still exists in Redis. Because `removeOnComplete: 100` prunes old completed jobs, a duplicate webhook arriving long after the original job completed *and* was pruned would find no existing job with that `jobId`, and Bull would create — and process — a genuine second job. This is precisely why `webhook_events` in Postgres (checked in the webhook controller, before a job is ever enqueued) is the primary, time-unlimited dedup layer, and Bull's `jobId` check is explicitly secondary. No action needed as long as the `webhook_events` check in the webhook controller is confirmed to run before every enqueue — worth a specific live-test in Session 5 confirming a very-late duplicate (arriving after the original job has been pruned from Bull) is still correctly caught by the DB check.

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

### utils/helpers.ts

- [ ] **`sanitizePhone` does not handle a single leading zero (local-format numbers)** — the function only strips a leading `00` (the international-dialing-prefix convention, e.g. `0097150...`). A bare local-trunk-prefix number like `0501234567` (missing the country code entirely) passes through completely unchanged — no leading zero removed, no country code added. This differs from the `00` case: it's not a stripping problem, it's a missing-country-code problem, and `sanitizePhone` has no way to know which country's convention applies without additional context (e.g. the tenant's own country/region). Currently low-risk in practice since real phone numbers mostly arrive via Meta's own webhook payloads (`wa_id`/`from`), which are already in clean international format — this gap would only surface if some other input path (a manually-entered contact, a CSV import, a future public API) ever hands this function a bare local-format number. Worth a deliberate decision in Session 7 (or wherever manual contact entry is built) on whether to: (a) reject/flag numbers that don't already look internationally-formatted via `isValidPhone`'s length check, (b) require a country code to be entered separately from the local number in any manual-entry UI, or (c) leave as-is if this path genuinely never occurs in practice — but decide consciously rather than leave it as an unnoticed edge case.

### utils/logger.ts

- [ ] **Session 6+** — Use `maskSensitive()` when logging objects that contain user data (currently exported but unused)
- [ ] **Later** — AsyncLocalStorage for automatic request ID propagation in all log calls (currently must pass `requestId` manually)

### types/express.d.ts

- [ ] **Session 6** — Decide: keep `TenantRecord`/`UserRecord`/`ContactRecord`/`MessageRecord` camelCase interfaces OR use Kysely `Selectable<T>` types directly. Currently both exist — duplication. Kysely types are snake_case (match DB). Express types are camelCase. A mapping layer is needed.

### safety.service.ts

- [ ] Arabic price mentions (e.g. "١٢٠٠٠٠٠ درهم") not detected — regex-matching Arabic numerals is a separate problem. Claude's system prompt instructs it not to quote prices in any language; if it does so in Arabic, this check won't catch it. Acceptable for now.
- [ ] Building/tower names with numbers (e.g. "Marina Gate Tower 2", "Damac Hills 2") not flagged — these are real property names, not invented addresses. Intentionally not flagged.
- [ ] `allow_prices` escape hatch in `botConfig.safetyRules` not yet surfaced in dashboard UI (Session 13). Convention: add `"allow_prices"` to safetyRules array to skip price check for businesses like restaurants/supermarkets that need to quote prices.
- [ ] `no_competitor: CompanyName` convention in safetyRules not yet documented in onboarding UI (Session 13).
- [ ] `botConfig.contactPhone` and `botConfig.contactEmail` fields don't exist yet — contact info leak check currently flags ALL phone numbers/emails in replies, including the business's own. When Session 7 adds these fields to tenant profile, whitelist them in the check.

### claude.service.ts

- [ ] **Session 5 — CRITICAL** — Check `onboarding_progress.step_bot_configured` BEFORE calling `generateReply()`. If false, the tenant's `bot_config` is empty/default and Claude will respond with generic non-answers ("various services", "Assistant") to a real customer. Processor should instead notify the tenant's agent and/or send a holding message, not call Claude with an unconfigured bot.
- [x] ~~Product gap — no audio/voice transcription path~~ — DECIDED, in scope for Session 5 (no longer deferred). Inbound: before calling `generateReply()`, download the voice note from Meta and send it to ElevenLabs Scribe (speech-to-text) to get real transcribed text — replaces the current `[audio message — no text content]` placeholder in `buildUserPrompt`. Outbound: after the safety check finalizes the reply text, optionally convert it to speech via ElevenLabs TTS (Flash v2.5) and send via the *already-existing* `uploadMedia()` + `sendAudioMessage()` functions in `whatsapp.service.ts` — no new WhatsApp-sending infrastructure needed, only the new TTS step. Default behavior: mirror the customer's format (voice note in → voice note reply; text in → text reply). Consider a `tenants.bot_config.voiceReplyMode` setting (`"match_customer" | "always_text" | "always_voice"`) for tenants who want to override the default. Both directions add a new, separate ElevenLabs cost per use — fold into the same per-tenant Claude cost-tracking mechanism already flagged under "Cost/margin protection," don't track it separately.
- [ ] Reply truncation (`MAX_REPLY_CHARS = 3500`) slices by character count — acceptable for English/Arabic but could land mid-sentence. Not a crash risk, just a cosmetic edge case if a model ever ignores the "under 300 words" instruction.

### Security & Ops Hygiene (Ongoing — Not Session-Specific)

These are not one-time tasks to complete in a single session. They're recurring habits that need to stay active for the life of the product. Re-check this list periodically, not just once.

- [ ] **Ongoing** — `npm audit` was 0 vulnerabilities as of last check (see Current State), but this is a point-in-time snapshot, not a permanent guarantee. New CVEs get disclosed in already-installed dependencies (Express, jsonwebtoken, bull, etc.) on an ongoing basis. Re-run `npm audit` regularly, or enable GitHub Dependabot alerts / Snyk on the repo so this happens automatically instead of relying on memory.
- [ ] **Later, before onboarding real paying clients** — No WAF / DDoS protection layer exists in front of Render. Current rate limiters (`generalLimiter`, `webhookLimiter`) protect against moderate abuse from a single source, not a genuine distributed attack. Cloudflare in front of Render is the natural fit — note this requires bumping `trust proxy` from `1` to `2` in `app.ts` (Cloudflare adds a proxy hop) if/when added.
- [ ] **Process, not code** — `.env` secrets are currently managed as plain files. As the classmate (frontend) and any freelance collaborators get involved, plaintext `.env` files passed via Slack/email/personal laptops are a common, boring leak vector — arguably more likely than any code-level exploit. Needs an explicit process: how secrets get shared, rotated if a laptop is lost, and rotated on team member offboarding. Not urgent at 2-person scale, but worth deciding before the team grows.
- [ ] **Before Session 12 (deploy) / before first paying client** — No session in the 13-session plan is explicitly a security review. Add one: run something like OWASP ZAP against a staging deploy, and do a focused manual pass on auth/session handling specifically once Session 6 ships — that session is the highest-stakes one security-wise, since it's the difference between "public webhook receiver" and "system holding other businesses' customer data behind a login."
- [ ] **Session 3, reframed** — `claude.service.ts` being untested against a real `ANTHROPIC_API_KEY` isn't just a functionality gap. Untested error paths (timeouts, malformed responses, real rate-limit responses) are a common place for security-relevant bugs to hide — e.g. an unhandled error accidentally leaking a stack trace or internal detail in a response. Treat live-testing this file as a security task too, not purely a "does it work" task.

### auth architecture (Session 6, forward-looking)

- [ ] Session 6 — document explicitly, don't assume — Refresh token rotation alone does not protect against exclusive, sustained token theft (both tokens stolen, real user's copies never used again). This scenario requires the absolute session lifetime cap (Decision #16) and audit-log-based anomaly signals to bound — rotation's protection is limited to the case where legitimate and stolen token use overlap and compete. Documented here so this limit is a known, accepted tradeoff rather than a surprise discovered later.

### Session 7 additions needed

- [ ] WebSockets (Socket.io) for real-time dashboard updates
    - Events: `new_message`, `message_status`, `hot_lead`, `broadcast_progress`, `new_notification`
    - Each tenant gets their own room: `tenant:{tenantId}`
    - Install: `npm install socket.io`

### Infrastructure

- [ ] Upstash Redis free tier deleted after 14 days inactivity. Once on Render (Session 12) server runs 24/7 — this won't recur. Until then, recreate if deleted.
- [ ] Supabase free tier pauses after 7 days inactivity. Already has Vercel cron job on the Dubai client project but Chatrix project needs its own protection.


### Deferred product features — confirmed feasible, revisit post-first-client

These are real, technically confirmed capabilities — not speculative — but deliberately out of scope until Chatrix has at least one real, paying client. Listed here so they aren't forgotten, and so the reasoning for deferring isn't re-litigated from scratch later.

- [ ] **WhatsApp Groups API** — Meta added native group messaging to the Cloud API in 2026 (Official Business Account required). Max 8 participants per group (business number takes one slot), max 10,000 groups per business number, invite-link-only joining. Supports text, media, and templates — does NOT support calls, interactive buttons/lists, or commerce messages. **Why deferred:** requires new `groups` and `group_participants` tables (breaks the current 1:1 tenant↔contact schema assumption), new webhook handling for 4 new event types (`group_lifecycle_update`, `group_participants_update`, `group_settings_update`, `group_status_update`), and an undesigned product decision — the bot cannot sensibly auto-reply to every message in a multi-human group thread the way it does in a 1:1 chat; needs explicit trigger logic (e.g. only respond when directly addressed). **Realistic use case for Chatrix's client types:** coordinating a single multi-stakeholder transaction (e.g. a property deal involving buyer, buyer's spouse, and a bank contact), not broadcast reach — Broadcasts already covers reach. **Pricing precedent:** DoubleTick gates group creation behind their PRO tier — if built, scope this the same way (Growth/Pro only, not Starter/Trial).
- [ ] **AI voice calling (inbound and/or outbound phone calls handled by an AI agent)** — confirmed technically buildable (Twilio for telephony/phone numbers + ElevenLabs Conversational AI for STT+LLM+TTS, officially integrated together). **Why deferred, more strongly than Groups:** this is architecturally a separate, parallel product, not an extension of the existing one. Requires: a live, persistent, real-time connection per call (fundamentally incompatible with the async Bull-queue design that underlies the entire WhatsApp pipeline — no "queue it and process later" is possible mid-call), a Twilio phone number + ElevenLabs agent per tenant (mirroring but entirely separate from each tenant's WhatsApp setup), a new `calls` table, and three simultaneous per-minute cost meters (Twilio + ElevenLabs + Claude) running for the full call duration. **Outbound calling specifically** carries real UAE telemarketing/consent compliance questions not yet researched — do not assume it's equivalent to WhatsApp business messaging rules. Revisit only once the core text-based product has real revenue and the team has capacity to own a genuinely separate real-time system.

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
    "update_summary": "string — summary of the PREVIOUS turn, not this one — see Decision #18",
    "humanRequested": "boolean — true if the customer is asking to speak with a human agent — see Decision #17",
    "suggestButtons": "string[] | null — up to 3 short options to offer as interactive buttons, only at a genuine decision point — null otherwise — see Decision #17"
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
✅ npm run dev → server starts, DB connected, Redis connected, Bull queue connected
✅ npm run migrate → all 3 migrations applied, skip logic works
✅ npm audit → 0 vulnerabilities
✅ /health → 200 healthy (DB + Redis + Queue all connected, LIVE VERIFIED)
✅ Webhook pipeline LIVE VERIFIED: signature → idempotency → tenant → enqueue → processor pickup
✅ Safety validator LIVE VERIFIED: 49/49 tests passing (npx tsx scripts/test-safety-service.ts)
⚠️  Redis: recreated June 27 (was deleted after inactivity) — update .env with new credentials
🟡  Session 3 (claude.service.ts): built + reviewed, blocked on real ANTHROPIC_API_KEY
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
Session 4  ✅ Complete — safety.service.ts built, reviewed, LIVE VERIFIED 2026-07-02. 8 safety checks: empty reply, reply too long, price invention, appointment commitment, availability claim, address invention, contact info leak, competitor mention. 49/49 tests passing. Zero cost — pure logic, no external APIs.
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
9. Before starting always think about which problem needs to be solved immediately and not push it 
    to later so that we go by building in a good smooth sequence without leaving any bug behind.