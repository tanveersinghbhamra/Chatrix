-- ─────────────────────────────────────────────────────────────
-- Chatrix Database — Migration 003
-- Critical additions: media support, opt-out tracking,
-- conversation assignment, multi-device sessions
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- FIX 1: messages — add media support
-- WhatsApp supports images, audio, video, documents, location
-- Currently messages.body only stores text
-- ─────────────────────────────────────────────────────────────
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text'
  CHECK (message_type IN (
    'text',
    'image',
    'audio',       -- voice notes
    'video',
    'document',
    'location',
    'sticker',
    'reaction',
    'interactive', -- buttons, lists
    'unsupported'  -- future WhatsApp types we don't handle yet
  ));

-- Media URL — where the file is stored (Meta CDN or your storage)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_url TEXT;

-- Media ID from Meta — used to download the media file
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_id VARCHAR(255);

-- MIME type — 'image/jpeg', 'audio/ogg', 'video/mp4', etc.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_mime_type VARCHAR(100);

-- Caption for image/video messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_caption TEXT;

-- File name for documents
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_filename VARCHAR(255);

-- Location data — stored as JSONB
-- { latitude: 25.2048, longitude: 55.2708, name: "Dubai Mall", address: "..." }
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS location_data JSONB;

-- Reaction data — emoji + message_id being reacted to
-- { emoji: "👍", reacted_to_message_id: "wamid.xxx" }
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reaction_data JSONB;

-- Index for media queries — find all media messages for a contact
CREATE INDEX IF NOT EXISTS idx_messages_type
  ON messages(contact_id, message_type, created_at DESC)
  WHERE message_type != 'text';

-- ─────────────────────────────────────────────────────────────
-- FIX 2: contacts — opt-out tracking
-- Legal requirement — GDPR, UAE PDPL, CAN-SPAM
-- Must never message opted-out contacts
-- ─────────────────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMP WITH TIME ZONE;

-- Reason for opt-out — 'customer_request', 'stop_keyword', 'admin_removed'
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS opted_out_reason VARCHAR(100);

-- Index — every message send must check opted_out first
CREATE INDEX IF NOT EXISTS idx_contacts_opted_out
  ON contacts(tenant_id, opted_out)
  WHERE opted_out = true;

-- ─────────────────────────────────────────────────────────────
-- FIX 3: contacts — conversation assignment
-- Which agent is responsible for this contact
-- Prevents two agents replying simultaneously
-- ─────────────────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID
  REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_contacts_assigned_agent
  ON contacts(assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: refresh_tokens
-- Multi-device session support
-- One token per login session — laptop + phone stay logged in simultaneously
-- Replaces single refresh_token column on users table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Stored as bcrypt hash — never store raw token
  token_hash      TEXT NOT NULL,

  -- Device info — helps user identify which sessions to revoke
  device_info     VARCHAR(255),  -- 'Chrome on MacBook', 'Safari on iPhone'
  ip_address      VARCHAR(45),

  -- Expiry — matches JWT_REFRESH_EXPIRY (7 days)
  expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Rotation tracking — token is invalidated after first use
  -- New token issued on every refresh
  used            BOOLEAN NOT NULL DEFAULT false,
  used_at         TIMESTAMP WITH TIME ZONE,

  -- Revocation — admin can force-logout a device
  revoked         BOOLEAN NOT NULL DEFAULT false,
  revoked_at      TIMESTAMP WITH TIME ZONE,
  revoked_reason  VARCHAR(100),

  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user
  ON refresh_tokens(user_id, revoked, expires_at);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant
  ON refresh_tokens(tenant_id);

-- Clean up old single refresh_token column from users
-- Data is now in refresh_tokens table
ALTER TABLE users DROP COLUMN IF EXISTS refresh_token;

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: contact_notes
-- Agents can add internal notes to contacts
-- Notes are not sent to the customer — internal only
-- e.g. "Customer is a doctor, very budget conscious"
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER contact_notes_updated_at
  BEFORE UPDATE ON contact_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact
  ON contact_notes(contact_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Verify migration
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_name = 'messages'
    AND column_name = 'message_type'
  ) THEN
    RAISE EXCEPTION 'Migration 003 failed: messages.message_type missing';
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'opted_out'
  ) THEN
    RAISE EXCEPTION 'Migration 003 failed: contacts.opted_out missing';
  END IF;

  IF NOT EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'refresh_tokens'
  ) THEN
    RAISE EXCEPTION 'Migration 003 failed: refresh_tokens missing';
  END IF;

  RAISE NOTICE 'Migration 003 completed successfully';
END $$;