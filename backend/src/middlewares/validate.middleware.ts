// Validates request body, query params, and URL params using Zod schemas
//
// Why validate at middleware level:
//   Controller functions should receive clean, validated data
//   and never worry about malformed input. Validation in middleware
//   means: if a controller runs, the data is already guaranteed valid.
//
// Why Zod:
//   Runtime validation with TypeScript type inference.
//   One schema gives you both validation AND TypeScript types.

import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { logger } from "../utils/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ValidationError {
    field: string;
    message: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────
// Strip 'body.' prefix from field paths before sending to client
// 'body.email' → 'email'
// Prevents leaking internal request structure to potential attackers
const formatErrors = (errors: ZodError): ValidationError[] => {
    return errors.errors.map((e) => {
        const path = e.path
            .filter((segment) => segment !== "body") // remove 'body' prefix
            .join(".");
        return {
            field: path || "unknown",
            message: e.message,
        };
    });
};

// ─── Validate middleware factory ──────────────────────────────────────────────
// Returns a middleware function configured for a specific Zod schema
// Usage: router.post('/signup', validate(signupSchema), controller)
export const validate =
    (schema: ZodSchema) =>
    (req: Request, res: Response, next: NextFunction): void => {
        try {
            // Parse validates and also strips unknown fields (safe by default in Zod)
            schema.parse({
                body: req.body,
                query: req.query,
                params: req.params,
            });

            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedErrors = formatErrors(error);

                logger.warn("Request validation failed", {
                    requestId: req.id,
                    path: req.path,
                    method: req.method,
                    errors: formattedErrors,
                });

                res.status(400).json({
                    error: "Validation failed",
                    details: formattedErrors,
                });

                return;
            }

            // Unexpected error — pass to global error handler
            next(error);
        }
    };
