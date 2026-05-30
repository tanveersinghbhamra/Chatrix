// utils/helpers.ts
//
// Pure utility functions — no side effects, no dependencies on other modules
// Used across controllers, services, and jobs throughout the codebase

import { randomBytes } from "crypto";

// ─── Phone number utilities ───────────────────────────────────────────────────

/**
 * Sanitises a phone number to E.164 format without the + sign
 * Meta WhatsApp API expects numbers without + prefix
 *
 * Examples:
 *   sanitizePhone('+971501234567') → '971501234567'
 *   sanitizePhone('00971501234567') → '971501234567'
 *   sanitizePhone('971 50 123 4567') → '971501234567'
 *   sanitizePhone('+1 (555) 123-4567') → '15551234567'
 */
export const sanitizePhone = (phone: string): string => {
    // Remove everything except digits
    let cleaned = phone.replace(/\D/g, "");

    // Remove leading 00 (international prefix some countries use)
    if (cleaned.startsWith("00")) {
        cleaned = cleaned.slice(2);
    }

    return cleaned;
};

/**
 * Checks if a phone number looks valid
 * Basic check — E.164 numbers are 7-15 digits
 */
export const isValidPhone = (phone: string): boolean => {
    const cleaned = sanitizePhone(phone);
    return cleaned.length >= 7 && cleaned.length <= 15;
};

// ─── Pagination utilities ─────────────────────────────────────────────────────

interface PaginationParams {
    page?: number | string;
    limit?: number | string;
    maxLimit?: number;
}

interface PaginationResult {
    limit: number;
    offset: number;
    page: number;
}

/**
 * Calculates pagination offset and limit for database queries
 * Enforces a maximum limit to prevent clients fetching millions of rows
 *
 * Usage in controller:
 *   const { limit, offset, page } = paginate({ page: req.query.page, limit: req.query.limit })
 *   const result = await query('SELECT * FROM contacts WHERE tenant_id = $1 LIMIT $2 OFFSET $3', [tenantId, limit, offset])
 */
export const paginate = ({
    page = 1,
    limit = 20,
    maxLimit = 100,
}: PaginationParams): PaginationResult => {
    const parsedPage = Math.max(1, parseInt(String(page), 10) || 1);
    const parsedLimit = Math.min(
        maxLimit,
        Math.max(1, parseInt(String(limit), 10) || 20),
    );
    const offset = (parsedPage - 1) * parsedLimit;

    return {
        page: parsedPage,
        limit: parsedLimit,
        offset,
    };
};

// ─── UUID validation ──────────────────────────────────────────────────────────

/**
 * Validates that a string is a valid UUID v4
 * Use before any database query that takes an ID as parameter
 * Prevents malformed IDs from reaching the database
 *
 * Why: Without this check, a request with id='abc' hits the DB
 * and PostgreSQL throws a confusing 'invalid input syntax for type uuid' error
 * With this check, you return a clean 400 Bad Request immediately
 */
export const isValidUUID = (value: string): boolean => {
    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
};

// ─── Sleep utility ────────────────────────────────────────────────────────────

/**
 * Pauses execution for a given number of milliseconds
 * Used in job queues for retry delays and rate limiting
 *
 * Usage:
 *   await sleep(1000); // wait 1 second before retrying
 */
export const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

// ─── OTP generation ───────────────────────────────────────────────────────────

/**
 * Generates a cryptographically secure numeric OTP
 * Used for email verification and password reset
 *
 * Why crypto.randomBytes instead of Math.random():
 *   Math.random() is not cryptographically secure — predictable patterns
 *   randomBytes uses the OS entropy source — truly random, unpredictable
 *
 * @param length - Number of digits (default 6)
 */
export const generateOTP = (length = 6): string => {
    const max = Math.pow(10, length);
    // randomBytes(3) gives 0-16777215 — we mod it to get 0-999999
    const random = parseInt(randomBytes(3).toString("hex"), 16) % max;
    // Pad with leading zeros if needed
    return random.toString().padStart(length, "0");
};

// ─── Error message extraction ─────────────────────────────────────────────────

/**
 * Safely extracts error message from unknown error type
 * TypeScript catch blocks type errors as 'unknown'
 * This helper avoids repetitive instanceof checks everywhere
 *
 * Usage:
 *   catch (error) {
 *     logger.error('Something failed', { error: getErrorMessage(error) });
 *   }
 */
export const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) return error.message;
    if (typeof error === "string") return error;
    return "Unknown error";
};

// ─── Response builders ────────────────────────────────────────────────────────

/**
 * Builds a consistent success response shape
 * Using consistent response shapes means your frontend always knows what to expect
 */
export const successResponse = <T>(data: T, message?: string) => ({
    success: true,
    message: message ?? "Success",
    data,
});

/**
 * Builds a consistent paginated response shape
 */
export const paginatedResponse = <T>(
    data: T[],
    page: number,
    limit: number,
    total: number,
) => ({
    success: true,
    data,
    pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
    },
});
