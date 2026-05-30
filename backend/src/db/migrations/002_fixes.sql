-- ─────────────────────────────────────────────────────────────
-- Chatrix Database — Migration 002
-- Fixes, additions, and real use case gaps
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- FIX 1: users.email — unique per tenant not globally
-- Same person can be agent at multiple businesses
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- Guard: only add constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_constraint
    WHERE conname = 'users_email_tenant_unique'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_email_tenant_unique UNIQUE (tenant_id, email);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_users_email_lookup ON users(email);

-- ─────────────────────────────────────────────────────────────
-- FIX 2: contacts.drip_paused_reason — increase to TEXT
-- ─────────────────────────────────────────────────────────────
ALTER TABLE contacts
  ALTER COLUMN drip_paused_reason TYPE TEXT;

-- ─────────────────────────────────────────────────────────────
-- FIX 3: drip_templates — add updated_at
-- ─────────────────────────────────────────────────────────────
ALTER TABLE drip_templates
  ADD COLUMN IF NOT EXISTS updated_at
  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

CREATE OR REPLACE TRIGGER drip_templates_updated_at
  BEFORE UPDATE ON drip_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- FIX 4: webhook_events — add tenant_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID
  REFERENCES tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant
  ON webhook_events(tenant_id)
  WHERE tenant_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- FIX 5: plan_limits — add timestamps
-- ─────────────────────────────────────────────────────────────
ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS created_at
  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
ALTER TABLE plan_limits
  ADD COLUMN IF NOT EXISTS updated_at
  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────
-- FIX 6: contacts — add drip_job_id for Bull job cancellation
-- When customer replies, we cancel the scheduled drip job
-- Without this field we cannot find the job to cancel it
-- ─────────────────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS drip_job_id VARCHAR(255);

-- ─────────────────────────────────────────────────────────────
-- FIX 7: contacts — add tags for broadcast filtering
-- Business can tag contacts: 'vip', 'interested_laser', etc.
-- Used to target specific groups in broadcast campaigns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_contacts_tags
  ON contacts USING gin(tags);

-- ─────────────────────────────────────────────────────────────
-- FIX 8: users — add personal_phone for report delivery
-- Different from business WhatsApp number
-- Used to send weekly reports to the owner personally
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS personal_phone VARCHAR(20);

-- ─────────────────────────────────────────────────────────────
-- FIX 9: tenants — add preferred_report_channel
-- Where to send weekly reports — whatsapp or email
-- ─────────────────────────────────────────────────────────────
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS report_channel VARCHAR(20)
  NOT NULL DEFAULT 'whatsapp'
  CHECK (report_channel IN ('whatsapp', 'email'));

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: broadcast_recipients
-- Individual send status per contact per broadcast
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id    UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending', 'sent', 'delivered',
                    'read', 'failed', 'skipped'
                  )),
  wa_message_id   VARCHAR(255),
  error_message   TEXT,
  sent_at         TIMESTAMP WITH TIME ZONE,
  delivered_at    TIMESTAMP WITH TIME ZONE,
  read_at         TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(broadcast_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast
  ON broadcast_recipients(broadcast_id, status);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_contact
  ON broadcast_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_wa_id
  ON broadcast_recipients(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: notifications
-- Persistent agent alerts — survives server restarts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL
                  CHECK (type IN (
                    'hot_lead',
                    'lead_replied',
                    'drip_completed',
                    'broadcast_done',
                    'plan_limit_warning',
                    'plan_limit_reached',
                    'trial_expiring',
                    'payment_failed',
                    'whatsapp_error'
                  )),
  title           VARCHAR(255) NOT NULL,
  body            TEXT NOT NULL,
  resource_type   VARCHAR(50),
  resource_id     UUID,
  read            BOOLEAN NOT NULL DEFAULT false,
  read_at         TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant
  ON notifications(tenant_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, read, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: onboarding_progress
-- Drives setup checklist in dashboard
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_progress (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step_whatsapp_connected   BOOLEAN NOT NULL DEFAULT false,
  step_bot_configured       BOOLEAN NOT NULL DEFAULT false,
  step_drip_setup           BOOLEAN NOT NULL DEFAULT false,
  step_team_invited         BOOLEAN NOT NULL DEFAULT false,
  step_first_broadcast      BOOLEAN NOT NULL DEFAULT false,
  whatsapp_connected_at     TIMESTAMP WITH TIME ZONE,
  bot_configured_at         TIMESTAMP WITH TIME ZONE,
  drip_setup_at             TIMESTAMP WITH TIME ZONE,
  team_invited_at           TIMESTAMP WITH TIME ZONE,
  first_broadcast_at        TIMESTAMP WITH TIME ZONE,
  completed                 BOOLEAN NOT NULL DEFAULT false,
  completed_at              TIMESTAMP WITH TIME ZONE,
  created_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE OR REPLACE TRIGGER onboarding_progress_updated_at
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create onboarding_progress when tenant is created
-- This trigger fires automatically — no Node.js code needed
CREATE OR REPLACE FUNCTION create_onboarding_progress()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO onboarding_progress (tenant_id)
  VALUES (NEW.id)
  ON CONFLICT (tenant_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tenant_create_onboarding
  AFTER INSERT ON tenants
  FOR EACH ROW EXECUTE FUNCTION create_onboarding_progress();

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: audit_logs
-- Immutable record of all important actions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(100) NOT NULL,
  resource_type   VARCHAR(50),
  resource_id     UUID,
  metadata        JSONB DEFAULT '{}',
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  request_id      UUID,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant
  ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON audit_logs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON audit_logs(action, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Verify migration
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'broadcast_recipients'
  ) THEN
    RAISE EXCEPTION 'Migration 002 failed: broadcast_recipients missing';
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'notifications'
  ) THEN
    RAISE EXCEPTION 'Migration 002 failed: notifications missing';
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'audit_logs'
  ) THEN
    RAISE EXCEPTION 'Migration 002 failed: audit_logs missing';
  END IF;

  RAISE NOTICE 'Migration 002 completed successfully';
END $$;