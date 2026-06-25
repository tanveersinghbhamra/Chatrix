// utils/logger.ts
//
// Structured logger using Winston
// Development: colorized, human-readable single lines
// Production: JSON format for log aggregation tools (Render, Datadog)
//
// Note: logger intentionally reads process.env directly (not config)
// because config/index.ts imports logger — circular dependency if reversed
// logger must be importable before config is validated

import winston from "winston";

const { combine, timestamp, json, colorize, simple } = winston.format;

const developmentFormat = combine(
    colorize(),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    simple(),
);

const productionFormat = combine(timestamp(), json());

export const logger = winston.createLogger({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    format:
        process.env.NODE_ENV === "production"
            ? productionFormat
            : developmentFormat,
    transports: [new winston.transports.Console()],
    exitOnError: false,
});

// Redacts sensitive fields before logging
// Use when logging objects that might contain user data
// Only checks top-level keys — does not recurse into nested objects
export const maskSensitive = (
    obj: Record<string, unknown>,
): Record<string, unknown> => {
    if (!obj || typeof obj !== "object") return obj;
    const masked = { ...obj };
    const sensitiveKeys = [
        "password",
        "token",
        "secret",
        "apiKey", // more specific than "key"
        "authorization",
        "encryptionKey",
        "accessToken",
        "refreshToken",
    ];
    for (const key of Object.keys(masked)) {
        if (
            sensitiveKeys.some((s) =>
                key.toLowerCase().includes(s.toLowerCase()),
            )
        ) {
            masked[key] = "[REDACTED]";
        }
    }
    return masked;
};
