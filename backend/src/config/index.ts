export const validateEnv = (): void => {
    const required: string[] = [
        "DATABASE_URL",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
        "ENCRYPTION_KEY",
    ];

    const missing = required.filter((v) => !process.env[v]);
    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}`,
        );
    }

    if (process.env.ENCRYPTION_KEY.length !== 32) {
        throw new Error("ENCRYPTION_KEY must be exactly 32 characters");
    }
};

export const config = {
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    nodeEnv: process.env.NODE_ENV,
    isDev: process.env.NODE_ENV !== "production",
    isProd: process.env.NODE_ENV === "production",
    db: {
        url: process.env.DATABASE_URL,
    },
    redis: {
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    },
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessExpiry: process.env.JWT_ACCESS_EXPIRY ?? "15m",
        refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? "7d",
    },
    encryption: {
        key: process.env.ENCRYPTION_KEY,
    },
    meta: {
        appId: process.env.META_APP_ID,
        appSecret: process.env.META_APP_SECRET,
        verifyToken: process.env.META_VERIFY_TOKEN,
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },
    frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3001",
} as const;

export type Config = typeof config;
