import { JwtPayload } from "jsonwebtoken";
import type { LocationData, ReactionData, ReportChannel } from "../db/types.js";

export interface AuthPayload extends JwtPayload {
    userId: string;
    tenantId: string;
    role: "owner" | "agent" | "viewer";
    email: string;
}

export interface TenantRecord {
    id: string;
    businessName: string;
    businessType: string;
    waNumber: string | null;
    waPhoneNumberId: string | null;
    waAccessToken: string | null;
    botConfig: Record<string, unknown>;
    plan: "trial" | "starter" | "growth" | "pro";
    planStatus: "trial" | "active" | "suspended" | "cancelled";
    conversationsUsed: number;
    broadcastsUsed: number;
    overageEnabled: boolean;
    billingCycleStart: Date;
    stripeCustomerId: string | null;
    stripeSubId: string | null;
    trialEndsAt: Date | null; // ✅ nullable — paid tenants have null
    reportChannel: ReportChannel; // ✅ Fixed — was missing, present in TenantsTable
    createdAt: Date;
    updatedAt: Date;
}

export interface UserRecord {
    id: string;
    tenantId: string;
    email: string;
    fullName: string | null;
    role: "owner" | "agent" | "viewer";
    lastLoginAt: Date | null;
    loginAttempts: number;
    lockedUntil: Date | null;
    personalPhone: string | null; // ✅ Fixed — was missing, present in UsersTable
    // Note: passwordHash is deliberately NOT included here, even though it exists
    // on UsersTable. req.currentUser is attached to every authenticated request —
    // the hash should never be reachable through it, even though it's just a bcrypt
    // hash. If any future code genuinely needs it, fetch it directly from the DB
    // for that specific purpose, don't add it back here.
    createdAt: Date;
    updatedAt: Date;
}

export interface ContactRecord {
    id: string;
    tenantId: string;
    phone: string;
    name: string | null;
    score: "hot" | "warm" | "cold" | "unknown";
    scoreReason: string | null;
    intent: string | null;
    budget: string | null;
    timeline: string | null;
    urgencySignals: string[];
    conversationSummary: string | null;
    summaryUpdatedAt: Date | null;
    messageCount: number;
    dripStage: number;
    dripPaused: boolean;
    dripPausedReason: string | null;
    dripJobId: string | null;
    tags: string[];
    assignedAgentId: string | null;
    assignedAt: Date | null;
    optedOut: boolean;
    optedOutAt: Date | null;
    optedOutReason: string | null;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface MessageRecord {
    id: string;
    tenantId: string;
    contactId: string;
    direction: "inbound" | "outbound";
    body: string;
    messageType:
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
    mediaUrl: string | null;
    mediaId: string | null;
    mediaMimeType: string | null;
    mediaCaption: string | null;
    mediaFilename: string | null;
    locationData: LocationData | null; // ✅ specific type from db/types.ts
    reactionData: ReactionData | null; // ✅ specific type from db/types.ts
    aiGenerated: boolean;
    safetyFlagged: boolean;
    safetyReason: string | null;
    status:
        | "pending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "pending_review";
    waMessageId: string | null;
    createdAt: Date;
}

declare global {
    namespace Express {
        interface Request {
            id: string;
            user?: AuthPayload;
            tenant?: TenantRecord;
            currentUser?: UserRecord;
        }
    }
}

export {};
