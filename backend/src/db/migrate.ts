// Runs database migrations in order
// Each migration file is numbered: 001_init.sql, 002_fixes.sql, etc.
// Safe to run multiple times — uses IF NOT EXISTS and IF EXISTS guards

import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";
import { query } from "./index.js";
import { logger } from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const runMigrations = async (): Promise<void> => {
    try {
        logger.info("Starting database migrations...");

        const migrationsDir = join(__dirname, "migrations");

        // Get all SQL files sorted by name — order matters
        const files = readdirSync(migrationsDir)
            .filter((f) => f.endsWith(".sql"))
            .sort(); // 001_init.sql before 002_fixes.sql

        logger.info(`Found ${files.length} migration file(s)`, { files });

        for (const file of files) {
            logger.info(`Running migration: ${file}`);

            const sql = readFileSync(join(migrationsDir, file), "utf8");
            await query(sql);

            logger.info(`Migration completed: ${file}`);
        }

        logger.info("All migrations completed successfully");
        process.exit(0);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error";
        logger.error("Migration failed", { error: message });
        process.exit(1);
    }
};

runMigrations();
