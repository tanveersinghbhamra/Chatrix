// src/db/index.ts
import pg from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import type { Database } from "./types.js";

const { Pool } = pg;

// ─── Connection pool ──────────────────────────────────────────────────────────
// One pool shared between Kysely and raw query function
// Kysely uses it for typed queries
// raw query() used only by migrate.ts
const pool = new Pool({
    connectionString: config.db.url,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on("connect", () => {
    logger.info("New database connection established");
});

pool.on("error", (err: Error) => {
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
});

// ─── Kysely instance ──────────────────────────────────────────────────────────
// Uses the same pg pool — no extra connections opened
// Every query through db.* is fully typed
// TypeScript will error if you access a column that doesn't exist
export const db = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
});

// ─── Wait for database ────────────────────────────────────────────────────────
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
                { error: message },
            );
            if (attempt === retries) {
                throw new Error(
                    `Could not connect to database after ${retries} attempts`,
                );
            }
            await new Promise((resolve) =>
                setTimeout(resolve, delayMs * attempt),
            );
        }
    }
};

// ─── Raw query ────────────────────────────────────────────────────────────────
// Used ONLY by migrate.ts to run raw SQL migration files
// All other code must use db.* (Kysely) for type safety
// If you find yourself using query() outside migrate.ts — stop and use Kysely
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

// ─── Transaction helper ───────────────────────────────────────────────────────
// For operations that must succeed or fail together
// Usage:
//   await transaction(async (client) => {
//       await client.query("UPDATE tenants SET ...")
//       await client.query("INSERT INTO messages ...")
//   })
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

// ─── Health check ─────────────────────────────────────────────────────────────
export const isHealthy = async (): Promise<boolean> => {
    try {
        await pool.query("SELECT 1");
        return true;
    } catch {
        return false;
    }
};

export default pool;
