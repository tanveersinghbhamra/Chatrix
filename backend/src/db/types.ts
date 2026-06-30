// src/db/types.ts
//
// Kysely database type definitions
// Every table in the database is represented here
// Column types must match the SQL schema exactly
//
// Naming convention:
//   Table interfaces use PascalCase + "Table" suffix
//   Column names match SQL exactly (snake_case)
//   Nullable columns are typed as "string | null" not "string | undefined"
//   JSONB columns are typed as specific interfaces where shape is known
//   Generated columns (id, created_at) use ColumnType<Output, Input, Update>

import {
    ColumnType,
    Generated,
    Insertable,
    Selectable,
    Updateable,
} from "kysely";

// ─── Kysely column type helpers ───────────────────────────────────────────────
// Generated<T> = column is auto-generated on insert, readable after
// ColumnType<S, I, U> = S=select type, I=insert type, U=update type

// ─── JSONB interfaces — known shapes ─────────────────────────────────────────

export interface BotConfig {
    businessDescription?: string;
    services?: string[];
    agentName?: string;
    tone?: string;
    safetyRules?: string[];
    openingHours?: string;
    location?: string;
    language?: string;
    [key: string]: unknown; // allow extra fields
}

export interface UrgencySignals {
    signals: string[];
}

export interface LocationData {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
}

export interface ReactionData {
    emoji: string;
    reacted_to_message_id: string;
}

// ─── Plan types ───────────────────────────────────────────────────────────────
export type Plan = "trial" | "starter" | "growth" | "pro";
export type PlanStatus = "trial" | "active" | "suspended" | "cancelled";
export type ReportChannel = "whatsapp" | "email";

// ─── User types ───────────────────────────────────────────────────────────────
export type UserRole = "owner" | "agent" | "viewer";

// ─── Contact types ────────────────────────────────────────────────────────────
export type LeadScore = "hot" | "warm" | "cold" | "unknown";

// ─── Message types ────────────────────────────────────────────────────────────
export type MessageDirection = "inbound" | "outbound";
export type MessageStatus =
    | "pending"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "pending_review";
export type MessageType =
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "location"
    | "sticker"
    | "reaction"
    | "interactive"
    | "unsupported";

// ─── Broadcast types ──────────────────────────────────────────────────────────
export type BroadcastStatus =
    | "draft"
    | "sending"
    | "done"
    | "failed"
    | "cancelled";
export type RecipientStatus =
    | "pending"
    | "sent"
    | "delivered"
    | "read"
    | "failed"
    | "skipped";

// ─── Notification types ───────────────────────────────────────────────────────
export type NotificationType =
    | "hot_lead"
    | "lead_replied"
    | "drip_completed"
    | "broadcast_done"
    | "plan_limit_warning"
    | "plan_limit_reached"
    | "trial_expiring"
    | "payment_failed"
    | "whatsapp_error";

// ─────────────────────────────────────────────────────────────────────────────
// TABLE INTERFACES
// Each interface represents one database table
// Generated<T> marks columns that are auto-generated (id, timestamps)
// ─────────────────────────────────────────────────────────────────────────────

// ─── tenants ──────────────────────────────────────────────────────────────────
export interface TenantsTable {
    id: Generated<string>;
    business_name: string;
    business_type: string;

    wa_number: string | null;
    wa_phone_number_id: string | null;
    // NOTE: wa_account_id was removed — no migration ever created this column.
    // Tenant resolution from Meta webhooks uses wa_phone_number_id instead,
    // matched against value.metadata.phone_number_id in the webhook payload.
    // See webhook.controller.ts.
    wa_access_token: string | null; // AES-256-GCM encrypted

    bot_config: ColumnType<BotConfig, BotConfig | string, BotConfig | string>;

    plan: Plan;
    plan_status: PlanStatus;

    conversations_used: number;
    broadcasts_used: number;
    billing_cycle_start: ColumnType<
        Date,
        Date | string | undefined,
        Date | string
    >;

    overage_enabled: boolean;

    stripe_customer_id: string | null;
    stripe_sub_id: string | null;

    trial_ends_at: ColumnType<
        Date | null,
        Date | string | null | undefined,
        Date | string | null
    >;

    report_channel: ReportChannel;

    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// ─── users ────────────────────────────────────────────────────────────────────
export interface UsersTable {
    id: Generated<string>;
    tenant_id: string;
    email: string;
    password_hash: string;
    full_name: string | null;
    role: UserRole;

    // Security
    last_login_at: Date | null;
    login_attempts: number;
    locked_until: Date | null;

    // Profile
    personal_phone: string | null;

    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// ─── contacts ─────────────────────────────────────────────────────────────────
export interface ContactsTable {
    id: Generated<string>;
    tenant_id: string;

    phone: string;
    name: string | null;

    // Lead intelligence
    score: LeadScore;
    score_reason: string | null;
    intent: string | null;
    budget: string | null;
    timeline: string | null;
    urgency_signals: ColumnType<string[], string[] | string, string[] | string>;

    // Conversation memory
    conversation_summary: string | null;
    summary_updated_at: Date | null;
    message_count: number;

    // Drip state
    drip_stage: number;
    drip_paused: boolean;
    drip_paused_reason: string | null;
    drip_job_id: string | null;

    // Broadcast targeting
    tags: ColumnType<string[], string[] | string, string[] | string>;

    // Opt-out — legal requirement
    opted_out: boolean;
    opted_out_at: Date | null;
    opted_out_reason: string | null;

    // Assignment
    assigned_agent_id: string | null;
    assigned_at: Date | null;

    last_message_at: Date | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// ─── messages ─────────────────────────────────────────────────────────────────
export interface MessagesTable {
    id: Generated<string>;
    tenant_id: string;
    contact_id: string;

    direction: MessageDirection;
    body: string;
    message_type: MessageType;

    // AI metadata
    ai_generated: boolean;
    safety_flagged: boolean;
    safety_reason: string | null;

    // Delivery
    status: MessageStatus;
    wa_message_id: string | null;

    // Media — populated for non-text messages
    media_url: string | null;
    media_id: string | null;
    media_mime_type: string | null;
    media_caption: string | null;
    media_filename: string | null;

    // Location — populated for location messages
    location_data: ColumnType<
        LocationData | null,
        LocationData | string | null,
        LocationData | string | null
    >;

    // Reaction — populated for reaction messages
    reaction_data: ColumnType<
        ReactionData | null,
        ReactionData | string | null,
        ReactionData | string | null
    >;

    created_at: Generated<Date>;
}

// ─── broadcasts ───────────────────────────────────────────────────────────────
export interface BroadcastsTable {
    id: Generated<string>;
    tenant_id: string;

    name: string;
    template_body: string;
    meta_template_name: string | null;

    recipient_count: number;
    sent_count: number;
    delivered_count: number;
    read_count: number;
    failed_count: number;

    status: BroadcastStatus;

    scheduled_at: Date | null;
    started_at: Date | null;
    completed_at: Date | null;

    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// ─── broadcast_recipients ─────────────────────────────────────────────────────
export interface BroadcastRecipientsTable {
    id: Generated<string>;
    broadcast_id: string;
    tenant_id: string;
    contact_id: string;

    status: RecipientStatus;
    wa_message_id: string | null;
    error_message: string | null;

    sent_at: Date | null;
    delivered_at: Date | null;
    read_at: Date | null;

    created_at: Generated<Date>;
}

// ─── drip_templates ───────────────────────────────────────────────────────────
export interface DripTemplatesTable {
    id: Generated<string>;
    tenant_id: string;
    stage: number;
    delay_hours: number;
    template_body: string;
    meta_template_name: string | null;
    active: boolean;

    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// ─── plan_limits ──────────────────────────────────────────────────────────────
export interface PlanLimitsTable {
    plan: Plan;
    conversations_limit: number;
    broadcasts_limit: number;
    broadcast_contacts_limit: number;
    agents_limit: number;
    drip_steps_limit: number;

    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// ─── webhook_events ───────────────────────────────────────────────────────────
export interface WebhookEventsTable {
    id: Generated<string>;
    tenant_id: string | null;
    event_id: string;
    event_type: string;
    payload: ColumnType<unknown, unknown | string, unknown | string>;
    processed: boolean;
    processed_at: Date | null;
    error: string | null;

    created_at: Generated<Date>;
}

// ─── notifications ────────────────────────────────────────────────────────────
export interface NotificationsTable {
    id: Generated<string>;
    tenant_id: string;
    user_id: string | null;

    type: NotificationType;
    title: string;
    body: string;

    resource_type: string | null;
    resource_id: string | null;

    read: boolean;
    read_at: Date | null;

    created_at: Generated<Date>;
}

// ─── onboarding_progress ──────────────────────────────────────────────────────
export interface OnboardingProgressTable {
    id: Generated<string>;
    tenant_id: string;

    step_whatsapp_connected: boolean;
    step_bot_configured: boolean;
    step_drip_setup: boolean;
    step_team_invited: boolean;
    step_first_broadcast: boolean;

    whatsapp_connected_at: Date | null;
    bot_configured_at: Date | null;
    drip_setup_at: Date | null;
    team_invited_at: Date | null;
    first_broadcast_at: Date | null;

    completed: boolean;
    completed_at: Date | null;

    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// ─── audit_logs ───────────────────────────────────────────────────────────────
export interface AuditLogsTable {
    id: Generated<string>;
    tenant_id: string | null;
    user_id: string | null;

    action: string;
    resource_type: string | null;
    resource_id: string | null;

    metadata: ColumnType<
        Record<string, unknown>,
        Record<string, unknown> | string,
        Record<string, unknown> | string
    >;

    ip_address: string | null;
    user_agent: string | null;
    request_id: string | null;

    created_at: Generated<Date>;
}

// ─── refresh_tokens ───────────────────────────────────────────────────────────
export interface RefreshTokensTable {
    id: Generated<string>;
    user_id: string;
    tenant_id: string;

    token_hash: string;
    device_info: string | null;
    ip_address: string | null;

    expires_at: ColumnType<Date, Date | string, Date | string>;

    used: boolean;
    used_at: Date | null;

    revoked: boolean;
    revoked_at: Date | null;
    revoked_reason: string | null;

    created_at: Generated<Date>;
}

// ─── contact_notes ────────────────────────────────────────────────────────────
export interface ContactNotesTable {
    id: Generated<string>;
    tenant_id: string;
    contact_id: string;
    user_id: string | null;
    body: string;

    created_at: Generated<Date>;
    updated_at: Generated<Date>;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE INTERFACE
// Maps table names to their interfaces
// This is what Kysely<Database> uses for full type inference
// ─────────────────────────────────────────────────────────────────────────────
export interface Database {
    tenants: TenantsTable;
    users: UsersTable;
    contacts: ContactsTable;
    messages: MessagesTable;
    broadcasts: BroadcastsTable;
    broadcast_recipients: BroadcastRecipientsTable;
    drip_templates: DripTemplatesTable;
    plan_limits: PlanLimitsTable;
    webhook_events: WebhookEventsTable;
    notifications: NotificationsTable;
    onboarding_progress: OnboardingProgressTable;
    audit_logs: AuditLogsTable;
    refresh_tokens: RefreshTokensTable;
    contact_notes: ContactNotesTable;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER TYPES
// Kysely provides Selectable, Insertable, Updateable helpers
// Use these in your service layer instead of the raw table interfaces
//
// Selectable<T> = what you get back from SELECT — Generated<X> becomes X
// Insertable<T> = what you pass to INSERT — Generated<X> becomes optional
// Updateable<T> = what you pass to UPDATE — everything becomes optional
// ─────────────────────────────────────────────────────────────────────────────
export type Tenant = Selectable<TenantsTable>;
export type NewTenant = Insertable<TenantsTable>;
export type TenantUpdate = Updateable<TenantsTable>;

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export type Contact = Selectable<ContactsTable>;
export type NewContact = Insertable<ContactsTable>;
export type ContactUpdate = Updateable<ContactsTable>;

export type Message = Selectable<MessagesTable>;
export type NewMessage = Insertable<MessagesTable>;
export type MessageUpdate = Updateable<MessagesTable>;

export type Broadcast = Selectable<BroadcastsTable>;
export type NewBroadcast = Insertable<BroadcastsTable>;
export type BroadcastUpdate = Updateable<BroadcastsTable>;

export type BroadcastRecipient = Selectable<BroadcastRecipientsTable>;
export type NewBroadcastRecipient = Insertable<BroadcastRecipientsTable>;

export type DripTemplate = Selectable<DripTemplatesTable>;
export type NewDripTemplate = Insertable<DripTemplatesTable>;
export type DripTemplateUpdate = Updateable<DripTemplatesTable>;

export type Notification = Selectable<NotificationsTable>;
export type NewNotification = Insertable<NotificationsTable>;

export type AuditLog = Selectable<AuditLogsTable>;
export type NewAuditLog = Insertable<AuditLogsTable>;

export type RefreshToken = Selectable<RefreshTokensTable>;
export type NewRefreshToken = Insertable<RefreshTokensTable>;

export type ContactNote = Selectable<ContactNotesTable>;
export type NewContactNote = Insertable<ContactNotesTable>;

export type OnboardingProgress = Selectable<OnboardingProgressTable>;
export type OnboardingProgressUpdate = Updateable<OnboardingProgressTable>;
