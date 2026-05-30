// middlewares/rateLimiter.middleware.ts
//
// Rate limiting using @upstash/ratelimit — designed specifically for Upstash
// Persists across server restarts via Redis
// Uses sliding window algorithm — more accurate than fixed windows
//
// Why @upstash/ratelimit over rate-limit-redis:
//   rate-limit-redis uses raw Redis protocol (EVAL, SCRIPT commands)
//   Upstash REST API doesn't support raw Redis protocol
//   @upstash/ratelimit uses Upstash's HTTP API natively — zero compatibility issues

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

// ─── Redis client ─────────────────────────────────────────────────────────────
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Sliding window = more accurate than fixed window
// Fixed window: 100 requests allowed at 11:59, another 100 at 12:00 = 200 in 2 seconds
// Sliding window: always looks back exactly 15 minutes — no boundary exploit

// General API — 100 requests per 15 minutes
const generalRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "15 m"),
    prefix: "rl:general",
    analytics: false,
});

// Auth — 5 attempts per 15 minutes (strict — prevents brute force)
const authRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "rl:auth",
    analytics: false,
});

// Webhook — 1000 per minute (Meta sends many webhooks rapidly)
const webhookRatelimit = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, "1 m"),
    prefix: "rl:webhook",
    analytics: false,
});

// ─── Key extractor ────────────────────────────────────────────────────────────
// Get real client IP — works correctly behind Render's proxy
const getClientIp = (req: Request): string => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
        return forwarded.split(",")[0].trim();
    }
    return req.ip ?? "unknown";
};

// ─── Middleware factory ───────────────────────────────────────────────────────
// Creates an Express middleware from an Upstash ratelimit instance
const createMiddleware =
    (limiter: Ratelimit, skipPaths: string[] = []) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // Skip rate limiting for specified paths
        if (skipPaths.includes(req.path)) {
            next();
            return;
        }

        const ip = getClientIp(req);

        try {
            const { success, limit, remaining, reset } =
                await limiter.limit(ip);

            // Set standard rate limit headers so clients know their status
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
            // If Redis is down, fail open — don't block all traffic
            // Log the error but let request through
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
