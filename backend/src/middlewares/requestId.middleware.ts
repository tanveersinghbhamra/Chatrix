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
import { v4 as uuidv4 } from "uuid";
import { logger } from "../utils/logger.js";

export const requestId = (
    req: Request,
    res: Response,
    next: NextFunction,
): void => {
    // Generate unique ID for this request
    req.id = uuidv4();

    // Send it back in response headers
    // Client can use this ID when reporting bugs to you
    res.setHeader("X-Request-ID", req.id);

    logger.info("Incoming request", {
        requestId: req.id,
        method: req.method,
        path: req.path,
        // Never log full IP in production — hash it for privacy
        ip: req.ip,
    });

    next();
};
