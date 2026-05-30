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

export const maskSensitive = (
    obj: Record<string, unknown>,
): Record<string, unknown> => {
    if (!obj || typeof obj !== "object") return obj;
    const masked = { ...obj };
    const sensitiveKeys = [
        "password",
        "token",
        "secret",
        "key",
        "authorization",
    ];
    for (const key of Object.keys(masked)) {
        if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
            masked[key] = "[REDACTED]";
        }
    }
    return masked;
};
