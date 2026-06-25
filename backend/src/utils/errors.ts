// utils/errors.ts
//
// Typed HTTP error hierarchy
// Throw these anywhere in your code — app.ts global error handler catches them
// and sends the correct HTTP status code automatically
//
// AppError.isOperational = true → show message to client
// Plain Error (no isOperational) → show "Internal server error" in production

export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = new.target.name; // ✅ "NotFoundError" not "Error"
        this.statusCode = statusCode;
        this.isOperational = true;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found") {
        super(message, 404);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(message, 401);
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(message, 403);
    }
}

export class ValidationError extends AppError {
    constructor(message = "Validation failed") {
        super(message, 400);
    }
}

export class ConflictError extends AppError {
    constructor(message = "Resource already exists") {
        super(message, 409);
    }
}

export class TooManyRequestsError extends AppError {
    constructor(message = "Too many requests") {
        super(message, 429);
    }
}

// ✅ Added — for when a tenant hits their plan's conversation/broadcast limit
export class PlanLimitError extends AppError {
    constructor(message = "Plan limit reached — please upgrade your plan") {
        super(message, 429);
    }
}

// ✅ Added — for when DB, Redis, or external APIs are temporarily unavailable
export class ServiceUnavailableError extends AppError {
    constructor(
        message = "Service temporarily unavailable — please try again",
    ) {
        super(message, 503);
    }
}
