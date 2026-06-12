// Runs database migrations in order
// Each migration file is numbered: 001_init.sql, 002_fixes.sql, etc.
// Safe to run multiple times — uses IF NOT EXISTS and IF EXISTS guards
// Tracks applied migrations in schema_migrations table

import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";
import { query, default as pool } from "./index.js";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const runMigrations = async (): Promise<void> => {
    try {
        logger.info("Starting database migrations...");

        // Ensure migration tracking table exists
        await query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename VARCHAR(255) PRIMARY KEY,
                executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            )
        `);

        const migrationsDir = join(__dirname, "migrations");

        // Get all SQL files sorted by name — order matters
        const files = readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql"))
            .sort(); // 001_init.sql before 002_fixes.sql

        logger.info(`Found ${files.length} migration file(s)`, { files });

        for (const file of files) {
            const alreadyRun = await query(
                "SELECT 1 FROM schema_migrations WHERE filename = $1",
                [file],
            );

            if (alreadyRun.rowCount && alreadyRun.rowCount > 0) {
                logger.info(`Skipping already-applied migration: ${file}`);
                continue;
            }

            logger.info(`Running migration: ${file}`);

            const sql = readFileSync(join(migrationsDir, file), "utf8");
            await query(sql);

            await query(
                "INSERT INTO schema_migrations (filename) VALUES ($1)",
                [file],
            );

            logger.info(`Migration completed: ${file}`);
        }

        logger.info("All migrations completed successfully");
        await pool.end();
        process.exit(0);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error";
        logger.error("Migration failed", { error: message });
        await pool.end();
        process.exit(1);
    }
};

runMigrations();
