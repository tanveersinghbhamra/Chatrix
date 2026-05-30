// app.ts
import "dotenv/config";
import express, {
    Request,
    Response,
    NextFunction,
    ErrorRequestHandler,
} from "express";
import helmet from "helmet";
import cors from "cors";
import hpp from "hpp";
import { Redis } from "@upstash/redis";
import { logger } from "./utils/logger.js";
import { isHealthy, waitForDatabase } from "./db/index.js";
import { validateEnv } from "./config/index.js";
import { AppError } from "./utils/errors.js";
import { getErrorMessage } from "./utils/helpers.js";
import {
    generalLimiter,
    authLimiter,
    webhookLimiter,
} from "./middlewares/rateLimiter.middleware.js";
import { requestId } from "./middlewares/requestId.middleware.js";

// ─── Validate env on startup ───────────────────────────────────────────────────
validateEnv();

// ─── Redis client — one instance, reused everywhere ───────────────────────────
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ─── Service health checker — used by /health and startup log ─────────────────
const checkServices = async (): Promise<{ db: boolean; redis: boolean }> => {
    const db = await isHealthy();
    let redisOk = false;
    try {
        await redis.ping();
        redisOk = true;
    } catch {
        redisOk = false;
    }
    return { db, redis: redisOk };
};

// ─── Express app ───────────────────────────────────────────────────────────────
const app = express();

// Trust Render's proxy — required for correct req.ip and rate limiting
// Without this, all requests appear to come from the same proxy IP
// '1' means trust the first proxy in the chain (Render's load balancer)
app.set("trust proxy", 1);

// ─── Security middleware ───────────────────────────────────────────────────────
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", "data:", "https:"],
            },
        },
        crossOriginEmbedderPolicy: false,
    }),
);

// CORS — supports multiple origins via comma-separated FRONTEND_URL
// Allows both Vercel preview URLs and custom domain simultaneously
// Example: FRONTEND_URL=https://chatrix.vercel.app,https://app.chatrix.io
const getAllowedOrigins = (): string[] => {
    const raw = process.env.FRONTEND_URL ?? "http://localhost:3001";
    return raw.split(",").map((origin) => origin.trim());
};

app.use(
    cors({
        origin: (origin, callback) => {
            const allowed = getAllowedOrigins();
            // Allow requests with no origin — mobile apps, Postman, server-to-server
            if (!origin || allowed.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`CORS: origin ${origin} not allowed`));
            }
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }),
);

app.use(hpp());
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ─── Rate limiting ─────────────────────────────────────────────────────────────
app.use("/api/", generalLimiter);
app.use("/api/auth/", authLimiter);
app.use("/webhook/", webhookLimiter);

// ─── Request ID ────────────────────────────────────────────────────────────────
app.use(requestId);

// ─── Health check ──────────────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response): Promise<void> => {
    const { db, redis: redisOk } = await checkServices();
    const status = db && redisOk ? "healthy" : "degraded";

    res.status(status === "healthy" ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        services: {
            database: db ? "connected" : "disconnected",
            redis: redisOk ? "connected" : "disconnected",
        },
    });
});

// ─── Routes — uncommented as each session completes ───────────────────────────
// Session 2:  import webhookRouter from './routes/webhook.route.js';
//             app.use('/webhook', webhookRouter);
// Session 6:  import authRouter from './routes/auth.route.js';
//             app.use('/api/auth', authRouter);
// Session 7:  import contactsRouter from './routes/contacts.route.js';
//             app.use('/api/contacts', contactsRouter);
// Session 10: import broadcastsRouter from './routes/broadcasts.route.js';
//             app.use('/api/broadcasts', broadcastsRouter);
// Session 11: import analyticsRouter from './routes/analytics.route.js';
//             app.use('/api/analytics', analyticsRouter);

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response): void => {
    res.status(404).json({ error: "Route not found" });
});

// ─── Global error handler ──────────────────────────────────────────────────────
const errorHandler: ErrorRequestHandler = (
    err: AppError | Error,
    req: Request,
    res: Response,
    _next: NextFunction,
): void => {
    const isOperational = err instanceof AppError && err.isOperational;
    const statusCode = err instanceof AppError ? err.statusCode : 500;
    const message = isOperational
        ? err.message
        : process.env.NODE_ENV === "production"
          ? "Internal server error"
          : err.message;

    logger.error("Unhandled error", {
        requestId: req.id,
        error: err.message,
        statusCode,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });

    res.status(statusCode).json({ error: message });
};

app.use(errorHandler);

// ─── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Wait for database before starting server
// Prevents accepting requests when DB is not ready
try {
    await waitForDatabase();
} catch (error) {
    logger.error("Database not reachable — cannot start server", {
        error: getErrorMessage(error),
    });
    process.exit(1);
}

const server = app.listen(PORT, async () => {
    try {
        const { db, redis: redisOk } = await checkServices();

        console.log("");
        console.log("  🚀 Chatrix API is running!");
        console.log("");
        console.log(`  🌐 Server      →  http://localhost:${PORT}`);
        console.log(`  🏥 Health      →  http://localhost:${PORT}/health`);
        console.log(
            `  📦 Database    →  ${db ? "✅ Connected" : "❌ Disconnected"}`,
        );
        console.log(
            `  🔴 Redis       →  ${redisOk ? "✅ Connected" : "❌ Disconnected"}`,
        );
        console.log(`  🌍 Environment →  ${process.env.NODE_ENV}`);
        console.log("");
    } catch (error) {
        logger.error("Startup health check failed", {
            error: getErrorMessage(error),
        });
    }
});

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = (signal: string): void => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
        logger.info("Server closed — exiting");
        process.exit(0);
    });
    setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
    }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason: unknown) => {
    logger.error("Unhandled promise rejection", {
        reason: reason instanceof Error ? reason.message : String(reason),
    });
    process.exit(1);
});

export default app;
