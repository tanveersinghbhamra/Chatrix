import "dotenv/config";
import "express-async-errors";
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
import { config, validateEnv } from "./config/index.js";
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

// ─── Redis client ──────────────────────────────────────────────────────────────
const redis = new Redis({
    url: config.upstash.redisUrl,
    token: config.upstash.redisToken,
});

// ─── Service health checker ────────────────────────────────────────────────────
const checkServices = async (): Promise<{
    db: boolean;
    redis: boolean;
    queue: boolean;
}> => {
    const db = await isHealthy();
    let redisOk = false;
    try {
        await redis.ping();
        redisOk = true;
    } catch {
        redisOk = false;
    }
    const queue = await isQueueHealthy();
    return { db, redis: redisOk, queue };
};

// ─── Express app ───────────────────────────────────────────────────────────────
const app = express();

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

// ─── CORS ──────────────────────────────────────────────────────────────────────
const getAllowedOrigins = (): string[] => {
    return config.frontendUrl.split(",").map((origin) => origin.trim());
};

app.use(
    cors({
        origin: (origin, callback) => {
            const allowed = getAllowedOrigins();
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

// ─── Body parsers ──────────────────────────────────────────────────────────────
app.use(hpp());

// Raw body for webhook — must be before express.json()
// Signature verification needs raw bytes — parsed JSON loses them
app.use("/webhook", express.raw({ type: "application/json" }));

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
    const { db, redis: redisOk, queue } = await checkServices();
    const status = db && redisOk && queue ? "healthy" : "degraded";

    res.status(status === "healthy" ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        services: {
            database: db ? "connected" : "disconnected",
            redis: redisOk ? "connected" : "disconnected",
            queue: queue ? "connected" : "disconnected",
        },
    });
});

// ─── Message processor (registers Bull worker on startup) ─────────────────────
import "./jobs/message.processor.js";
import { isQueueHealthy, closeQueue } from "./services/queue.service.js";

// ─── Routes ────────────────────────────────────────────────────────────────────
import webhookRouter from "./routes/webhook.routes.js";
app.use("/webhook", webhookRouter);
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
        : config.isProd
          ? "Internal server error"
          : err.message;

    logger.error("Unhandled error", {
        requestId: req.id,
        error: err.message,
        statusCode,
        stack: config.isDev ? err.stack : undefined,
    });

    res.status(statusCode).json({ error: message });
};

app.use(errorHandler);

// ─── Start server ──────────────────────────────────────────────────────────────
const PORT = config.port;

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
        const { db, redis: redisOk, queue } = await checkServices();

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
        console.log(
            `  📬 Queue       →  ${queue ? "✅ Connected" : "❌ Disconnected"}`,
        );
        console.log(`  🌍 Environment →  ${config.nodeEnv}`);
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
        // Close Bull queue after HTTP server stops accepting requests.
        // This releases the ioredis connection cleanly — important on Upstash
        // free tier which has a hard connection limit.
        closeQueue().finally(() => {
            logger.info("Server and queue closed — exiting");
            process.exit(0);
        });
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
