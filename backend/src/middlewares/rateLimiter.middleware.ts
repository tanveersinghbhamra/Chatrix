import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

// ─── Redis client ─────────────────────────────────────────────────────────────
const redis = new Redis({
    url: config.upstash.redisUrl,
    token: config.upstash.redisToken,
});

// ─── Rate limiters ────────────────────────────────────────────────────────────
const generalRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "15 m"),
    prefix: "rl:general",
    analytics: false,
});

const authRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "rl:auth",
    analytics: false,
});

const webhookRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, "1 m"),
    prefix: "rl:webhook",
    analytics: false,
});

// ─── Key extractor ────────────────────────────────────────────────────────────
// Use Express's built-in req.ip which correctly handles proxy trust
// Requires app.set('trust proxy', 1) in app.ts — handles Render's load balancer
const getClientIp = (req: Request): string => {
    return req.ip ?? req.socket.remoteAddress ?? "unknown";
};

// ─── Middleware factory ───────────────────────────────────────────────────────
const createMiddleware =
    (limiter: Ratelimit, skipPaths: string[] = []) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (skipPaths.includes(req.path)) {
            next();
            return;
        }

        const ip = getClientIp(req);

        try {
            const { success, limit, remaining, reset } =
                await limiter.limit(ip);

            res.setHeader("RateLimit-Limit", limit);
            res.setHeader("RateLimit-Remaining", remaining);
            res.setHeader("RateLimit-Reset", new Date(reset).toISOString());

            if (!success) {
                logger.warn("Rate limit exceeded", {
                    ip,
                    path: req.path,
                    method: req.method,
                    requestId: req.id,
                });

                res.status(429).json({
                    error: "Too many requests, please try again later.",
                    retryAfter: new Date(reset).toISOString(),
                });
                return;
            }

            next();
        } catch (error) {
            logger.error("Rate limiter error — failing open", {
                error: error instanceof Error ? error.message : "Unknown error",
                ip,
                path: req.path,
            });
            next();
        }
    };

// ─── Exported middleware ──────────────────────────────────────────────────────
export const generalLimiter = createMiddleware(generalRatelimit, ["/health"]);
export const authLimiter = createMiddleware(authRatelimit);
export const webhookLimiter = createMiddleware(webhookRatelimit);
