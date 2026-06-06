// Single source of truth for all environment variables
// Call validateEnv() before anything else in app.ts
// Every other file imports from here — never from process.env directly

import "dotenv/config";

// ─── Helper ───────────────────────────────────────────────────────────────────
// Reads an env var and throws immediately if missing
// This converts string | undefined to string — TypeScript knows it's safe
const requireEnv = (key: string): string => {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
};

// ─── Validation ───────────────────────────────────────────────────────────────
// Call this once at startup in app.ts before anything else
// Validates things requireEnv can't — like length constraints
export const validateEnv = (): void => {
    // requireEnv below already handles missing vars
    // This function handles format/constraint validation only

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (encryptionKey && encryptionKey.length !== 32) {
        throw new Error(
            `ENCRYPTION_KEY must be exactly 32 characters. Got: ${encryptionKey.length}`,
        );
    }

    const port = process.env.PORT;
    if (port && isNaN(parseInt(port, 10))) {
        throw new Error(`PORT must be a number. Got: ${port}`);
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && !anthropicKey.startsWith("sk-ant-")) {
        throw new Error(
            "ANTHROPIC_API_KEY format invalid — must start with sk-ant-",
        );
    }

    // Validate JWT expiry formats — must be verifiable by jsonwebtoken
    const jwtAccessExpiry = process.env.JWT_ACCESS_EXPIRY ?? "15m";
    const jwtRefreshExpiry = process.env.JWT_REFRESH_EXPIRY ?? "7d";
    const validExpiry = /^\d+[smhd]$/;
    if (!validExpiry.test(jwtAccessExpiry)) {
        throw new Error(
            `JWT_ACCESS_EXPIRY format invalid: ${jwtAccessExpiry}. Use format: 15m, 1h, 7d`,
        );
    }
    if (!validExpiry.test(jwtRefreshExpiry)) {
        throw new Error(
            `JWT_REFRESH_EXPIRY format invalid: ${jwtRefreshExpiry}. Use format: 15m, 1h, 7d`,
        );
    }
};

// ─── Config object ────────────────────────────────────────────────────────────
// All values are strings — never undefined
// TypeScript knows this because requireEnv throws instead of returning undefined
export const config = {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    nodeEnv: process.env.NODE_ENV ?? "development",
    isDev: process.env.NODE_ENV !== "production",
    isProd: process.env.NODE_ENV === "production",

    db: {
        url: requireEnv("DATABASE_URL"),
    },

    // Named 'upstash' to match the library — @upstash/redis, @upstash/ratelimit
    upstash: {
        redisUrl: requireEnv("UPSTASH_REDIS_REST_URL"),
        redisToken: requireEnv("UPSTASH_REDIS_REST_TOKEN"),
    },

    anthropic: {
        apiKey: requireEnv("ANTHROPIC_API_KEY"),
    },

    jwt: {
        accessSecret: requireEnv("JWT_ACCESS_SECRET"),
        refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
        accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? "15m",
        refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? "7d",
    },

    encryption: {
        key: (() => {
            const key = requireEnv("ENCRYPTION_KEY");
            if (key.length !== 32) {
                throw new Error(
                    `ENCRYPTION_KEY must be exactly 32 characters. Got: ${key.length}`,
                );
            }
            return key;
        })(),
    },

    meta: {
        appId: requireEnv("META_APP_ID"),
        appSecret: requireEnv("META_APP_SECRET"),
        verifyToken: requireEnv("META_VERIFY_TOKEN"),
    },

    // Stripe is optional at startup — server works without it
    // Billing routes will validate these exist before using them
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },

    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3001",
} as const;

export type Config = typeof config;
