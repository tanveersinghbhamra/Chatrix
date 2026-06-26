// Declares the shape of process.env for TypeScript
// Every environment variable your app uses must be declared here

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            // Server
            NODE_ENV: "development" | "production" | "test";
            PORT?: string;

            // Database
            DATABASE_URL: string;

            // Redis
            UPSTASH_REDIS_REST_URL: string;
            UPSTASH_REDIS_REST_TOKEN: string;

            // Anthropic
            ANTHROPIC_API_KEY: string;

            // Meta WhatsApp
            META_APP_ID: string;
            META_APP_SECRET: string;
            META_VERIFY_TOKEN: string;

            // Stripe — optional until Session 9
            STRIPE_SECRET_KEY?: string;      // ✅ optional
            STRIPE_WEBHOOK_SECRET?: string;  // ✅ optional

            // JWT
            JWT_ACCESS_SECRET: string;
            JWT_REFRESH_SECRET: string;
            JWT_ACCESS_EXPIRY?: string;
            JWT_REFRESH_EXPIRY?: string;

            // Encryption
            ENCRYPTION_KEY: string;

            // Frontend
            FRONTEND_URL?: string;
        }
    }
}

export {};