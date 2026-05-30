-- ─────────────────────────────────────────────────────────────
-- Chatrix Database — Initial Migration
-- Run once to create all tables
-- Every table uses UUID primary keys and tenant_id isolation
-- ─────────────────────────────────────────────────────────────

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- TENANTS
-- One row per business that signs up to Chatrix
-- This is the root of all multi-tenant data isolation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name       VARCHAR(255) NOT NULL,

  -- Generic business type — any business, not just clinic/real_estate
  business_type       VARCHAR(100) NOT NULL DEFAULT 'general',

  -- WhatsApp details — connected via Meta Embedded Signup
  wa_number           VARCHAR(20) UNIQUE,
  wa_phone_number_id  VARCHAR(50) UNIQUE,
  wa_access_token     TEXT,         -- AES-256 encrypted before storing

  -- Bot configuration — flexible JSONB for any business type
  -- Contains: businessDescription, services, agentName, tone, 
  --           safetyRules, openingHours, location, language
  bot_config          JSONB NOT NULL DEFAULT '{}',

  -- Subscription plan
  plan                VARCHAR(20) NOT NULL DEFAULT 'trial'
                      CHECK (plan IN ('trial', 'starter', 'growth', 'pro')),
  plan_status         VARCHAR(20) NOT NULL DEFAULT 'trial'
                      CHECK (plan_status IN ('trial', 'active', 'suspended', 'cancelled')),

  -- Usage counters — reset monthly by cron job
  conversations_used  INTEGER NOT NULL DEFAULT 0,
  broadcasts_used     INTEGER NOT NULL DEFAULT 0,
  billing_cycle_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Overage billing opt-in
  overage_enabled     BOOLEAN NOT NULL DEFAULT false,

  -- Stripe subscription
  stripe_customer_id  VARCHAR(255),
  stripe_sub_id       VARCHAR(255),

  -- Trial expiry
  trial_ends_at       TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '14 days'),

  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- USERS
-- People who log into the Chatrix dashboard
-- Each user belongs to one tenant
-- One tenant can have multiple users (owner, agents, viewers)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,         -- bcrypt, 12 rounds
  full_name       VARCHAR(255),
  role            VARCHAR(20) NOT NULL DEFAULT 'owner'
                  CHECK (role IN ('owner', 'agent', 'viewer')),

  -- Refresh token — stored hashed, rotated on every use
  refresh_token   TEXT,

  -- Security tracking
  last_login_at   TIMESTAMP WITH TIME ZONE,
  login_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMP WITH TIME ZONE,

  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- CONTACTS
-- Every person who has ever messaged a tenant's WhatsApp number
-- One contact per phone number per tenant
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  phone           VARCHAR(20) NOT NULL,
  name            VARCHAR(255),          -- extracted by AI or set manually

  -- AI lead intelligence
  score           VARCHAR(10) NOT NULL DEFAULT 'unknown'
                  CHECK (score IN ('hot', 'warm', 'cold', 'unknown')),
  score_reason    TEXT,
  intent          TEXT,                  -- what they want
  budget          VARCHAR(100),
  timeline        VARCHAR(100),
  urgency_signals JSONB DEFAULT '[]',    -- array of detected signals

  -- Conversation memory — memory summary pattern
  -- Never send full history to Claude — send this summary + last 6 messages
  conversation_summary    TEXT,
  summary_updated_at      TIMESTAMP WITH TIME ZONE,
  message_count           INTEGER NOT NULL DEFAULT 0,

  -- Drip sequence state
  drip_stage      INTEGER NOT NULL DEFAULT 0,
  drip_paused     BOOLEAN NOT NULL DEFAULT false,
  drip_paused_reason VARCHAR(100),

  -- Timestamps
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One contact per phone number per tenant
  UNIQUE(tenant_id, phone)
);

-- ─────────────────────────────────────────────────────────────
-- MESSAGES
-- Every WhatsApp message — inbound and outbound
-- Full conversation history per contact
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  direction       VARCHAR(10) NOT NULL
                  CHECK (direction IN ('inbound', 'outbound')),
  body            TEXT NOT NULL,

  -- Message metadata
  ai_generated    BOOLEAN NOT NULL DEFAULT false,
  safety_flagged  BOOLEAN NOT NULL DEFAULT false,
  safety_reason   TEXT,                  -- why it was flagged

  -- Delivery status — updated by Meta webhooks
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending', 'sent', 'delivered',
                    'read', 'failed', 'pending_review'
                  )),

  -- Meta message ID — for deduplication
  -- Meta sometimes sends duplicate webhooks — this prevents double processing
  wa_message_id   VARCHAR(255) UNIQUE,

  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- BROADCASTS
-- Bulk WhatsApp campaigns sent to multiple contacts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  name              VARCHAR(255) NOT NULL,
  template_body     TEXT NOT NULL,
  meta_template_name VARCHAR(255),       -- approved Meta template name

  -- Campaign stats
  recipient_count   INTEGER NOT NULL DEFAULT 0,
  sent_count        INTEGER NOT NULL DEFAULT 0,
  delivered_count   INTEGER NOT NULL DEFAULT 0,
  read_count        INTEGER NOT NULL DEFAULT 0,
  failed_count      INTEGER NOT NULL DEFAULT 0,

  status            VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sending', 'done', 'failed', 'cancelled')),

  scheduled_at      TIMESTAMP WITH TIME ZONE,
  started_at        TIMESTAMP WITH TIME ZONE,
  completed_at      TIMESTAMP WITH TIME ZONE,

  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- DRIP TEMPLATES
-- Follow-up message sequences per tenant
-- Stage 1 = first follow-up, stage 2 = second, etc.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drip_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stage                 INTEGER NOT NULL,  -- 1, 2, 3, 4
  delay_hours           INTEGER NOT NULL,  -- hours after previous stage
  template_body         TEXT NOT NULL,
  meta_template_name    VARCHAR(255),
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  UNIQUE(tenant_id, stage)
);

-- ─────────────────────────────────────────────────────────────
-- PLAN LIMITS
-- Defines what each plan includes
-- Seeded with default values below
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_limits (
  plan                    VARCHAR(20) PRIMARY KEY,
  conversations_limit     INTEGER NOT NULL,
  broadcasts_limit        INTEGER NOT NULL,
  broadcast_contacts_limit INTEGER NOT NULL,
  agents_limit            INTEGER NOT NULL,
  drip_steps_limit        INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- WEBHOOK EVENTS
-- Stores every incoming Meta webhook for idempotency
-- Prevents processing the same message twice
-- (Meta sometimes sends duplicate webhooks)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        VARCHAR(255) UNIQUE NOT NULL,  -- Meta's message ID
  event_type      VARCHAR(50) NOT NULL,
  payload         JSONB NOT NULL,
  processed       BOOLEAN NOT NULL DEFAULT false,
  processed_at    TIMESTAMP WITH TIME ZONE,
  error           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- INDEXES
-- Speed up the most common queries
-- Every query filters by tenant_id — index it everywhere
-- ─────────────────────────────────────────────────────────────

-- Tenants
CREATE INDEX IF NOT EXISTS idx_tenants_wa_number
  ON tenants(wa_number);
CREATE INDEX IF NOT EXISTS idx_tenants_wa_phone_number_id
  ON tenants(wa_phone_number_id);
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer
  ON tenants(stripe_customer_id);

-- Users
CREATE INDEX IF NOT EXISTS idx_users_tenant
  ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users(email);

-- Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_tenant
  ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone
  ON contacts(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_contacts_score
  ON contacts(tenant_id, score);
CREATE INDEX IF NOT EXISTS idx_contacts_last_message
  ON contacts(tenant_id, last_message_at DESC);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_contact
  ON messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_tenant
  ON messages(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_wa_id
  ON messages(wa_message_id);

-- Broadcasts
CREATE INDEX IF NOT EXISTS idx_broadcasts_tenant
  ON broadcasts(tenant_id, created_at DESC);

-- Webhook events
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id
  ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed
  ON webhook_events(processed, created_at);

-- ─────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGER
-- Automatically updates updated_at column on every row change
-- You never have to manually set updated_at in your Node.js code
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tenants_updated_at
  BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER broadcasts_updated_at
  BEFORE UPDATE ON broadcasts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- SEED DATA — Plan limits
-- ─────────────────────────────────────────────────────────────
INSERT INTO plan_limits
  (plan, conversations_limit, broadcasts_limit, broadcast_contacts_limit, agents_limit, drip_steps_limit)
VALUES
  ('trial',   100,  1,  100,  1, 3),
  ('starter', 500,  1,  500,  1, 3),
  ('growth',  2000, 4,  2000, 3, 5),
  ('pro',     99999, 99, 5000, 99, 99)
ON CONFLICT (plan) DO NOTHING;