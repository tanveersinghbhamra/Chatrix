// middlewares/requestId.middleware.ts
//
// Assigns a unique ID to every incoming request
//
// Why request IDs:
//   When something breaks, you want to find every log line
//   related to that specific request. Without an ID, logs from
//   simultaneous requests mix together and debugging is impossible.
//
//   With request IDs:
//   logger.info('Message saved', { requestId: 'abc-123' })
//   logger.error('DB failed', { requestId: 'abc-123' })
//   → You can filter all logs for 'abc-123' and see the full story

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto"; // ✅ built-in, no uuid package needed
import { createHash } from "crypto";
import { logger } from "../utils/logger.js";

// ✅ Hash IP for privacy compliance (UAE PDPL)
// Same IP produces same hash — correlatable but not reversible
const hashIp = (ip: string | undefined): string => {
    if (!ip) return "unknown";
    return createHash("sha256").update(ip).digest("hex").slice(0, 16);
};

export const requestId = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    const start = Date.now();

    // Generate unique ID for this request
    req.id = randomUUID();

    // Send it back in response headers
    // Client can use this ID when reporting bugs to you
    res.setHeader("X-Request-ID", req.id);

    // ✅ Changed to debug — too noisy at info level in production
    // ✅ Skip health checks — uptime monitor pings every 30s, no value logging it
    if (req.path !== "/health") {
        logger.debug("Incoming request", {
            requestId: req.id,
            method: req.method,
            path: req.path,
            ip: hashIp(req.ip), // ✅ hashed — never log raw IPs
        });
    }

    // ✅ Log response when it finishes — know which requests succeeded/failed
    res.on("finish", () => {
        if (req.path !== "/health") {
            logger.debug("Request completed", {
                requestId: req.id,
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration: `${Date.now() - start}ms`,
            });
        }
    });

    next();
};
