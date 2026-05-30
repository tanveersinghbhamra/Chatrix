import pg from "pg";
import { logger } from "../utils/logger.js";

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on("connect", () => {
    logger.info("New database connection established");
});

// Verify connection is reachable on startup with retry
// Prevents server from accepting traffic before DB is ready
export const waitForDatabase = async (
    retries = 5,
    delayMs = 2000,
): Promise<void> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await pool.query("SELECT 1");
            logger.info("Database connection verified");
            return;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Unknown error";
            logger.warn(
                `Database connection attempt ${attempt}/${retries} failed`,
                {
                    error: message,
                },
            );
            if (attempt === retries) {
                throw new Error(
                    `Could not connect to database after ${retries} attempts`,
                );
            }
            // Wait before retrying — exponential backoff
            await new Promise((resolve) =>
                setTimeout(resolve, delayMs * attempt),
            );
        }
    }
};

pool.on("error", (err: Error) => {
    // Log but don't exit — pool errors are often transient network blips
    // PostgreSQL pool recovers automatically from temporary disconnections
    // Only exit on authentication errors — those won't recover on their own
    logger.error("Unexpected database pool error", { error: err.message });

    const fatalErrors = [
        "password authentication failed",
        "database does not exist",
        "role does not exist",
    ];

    const isFatal = fatalErrors.some((msg) =>
        err.message.toLowerCase().includes(msg),
    );

    if (isFatal) {
        logger.error("Fatal database error — shutting down");
        process.exit(1);
    }
    // Non-fatal — log and let pool recover automatically
});

export const query = async (
    text: string,
    params?: unknown[],
): Promise<pg.QueryResult> => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug("Database query executed", {
            query: text.substring(0, 100),
            duration: `${duration}ms`,
            rows: result.rowCount,
        });
        return result;
    } catch (error) {
        logger.error("Database query failed", {
            query: text.substring(0, 100),
            error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
    }
};

export const transaction = async <T>(
    callback: (client: pg.PoolClient) => Promise<T>,
): Promise<T> => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        logger.error("Transaction rolled back", {
            error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
    } finally {
        client.release();
    }
};

export const isHealthy = async (): Promise<boolean> => {
    try {
        await pool.query("SELECT 1");
        return true;
    } catch {
        return false;
    }
};

export default pool;
