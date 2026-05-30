export class AppError extends Error {
    public statusCode: number;
    public isOperational: boolean;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        // Fix prototype chain — required when extending built-in classes in TypeScript
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
