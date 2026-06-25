import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { logger } from "../utils/logger.js";

interface ValidationError {
    field: string;
    message: string;
}

const formatErrors = (errors: ZodError): ValidationError[] => {
    return errors.errors.map((e) => {
        const path = e.path.filter((segment) => segment !== "body").join(".");
        return {
            field: path || "unknown",
            message: e.message,
        };
    });
};

export const validate =
    (schema: ZodSchema) =>
    (req: Request, res: Response, next: NextFunction): void => {
        try {
            // Parse validates, coerces, and strips unknown fields
            const result = schema.parse({
                body: req.body,
                query: req.query,
                params: req.params,
            });

            // ✅ Apply coerced/transformed values back to request
            // Controllers receive clean, transformed data — not raw user input
            // Also strips unknown fields that aren't in the schema
            req.body = result.body ?? req.body;
            if (result.query) req.query = result.query;
            if (result.params) req.params = result.params;

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

            next(error);
        }
    };
