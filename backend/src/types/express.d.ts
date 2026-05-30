// types/express.d.ts
import { JwtPayload } from "jsonwebtoken";

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
    billingCycleStart: Date; // added — needed for monthly reset logic
    stripeCustomerId: string | null;
    stripeSubId: string | null;
    trialEndsAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

// Shape of a user loaded from database
export interface UserRecord {
    id: string;
    tenantId: string;
    email: string;
    fullName: string | null;
    role: "owner" | "agent" | "viewer";
    lastLoginAt: Date | null;
    loginAttempts: number; // needed for account lockout logic
    lockedUntil: Date | null; // needed for account lockout logic
    createdAt: Date;
    updatedAt: Date;
}

// Shape of a contact loaded from database
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
    dripJobId: string | null; // Bull job ID for cancellation
    tags: string[]; // for broadcast filtering
    assignedAgentId: string | null; // conversation ownership
    assignedAt: Date | null;
    optedOut: boolean; // legal opt-out
    optedOutAt: Date | null;
    optedOutReason: string | null;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

// Shape of a message loaded from database
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
    locationData: Record<string, unknown> | null;
    reactionData: Record<string, unknown> | null;
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
// Extend Express Request
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
