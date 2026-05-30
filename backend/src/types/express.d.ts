// Extends Express Request type with custom properties
// Declaration merging — adds our properties to Express's existing type
// without modifying the Express package itself

import { JwtPayload } from "jsonwebtoken";

// Shape of our decoded JWT payload
export interface AuthPayload extends JwtPayload {
    userId: string;
    tenantId: string;
    role: "owner" | "agent" | "viewer";
    email: string;
}

// Shape of tenant loaded from database
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
    stripeCustomerId: string | null;
    stripeSubId: string | null;
    trialEndsAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

// Extend Express Request
declare global {
    namespace Express {
        interface Request {
            id: string; // request ID — set by requestId middleware
            user?: AuthPayload; // decoded JWT — set by auth middleware
            tenant?: TenantRecord; // loaded tenant — set by tenant middleware
        }
    }
}

export {};
