// Runs database migrations against Supabase PostgreSQL

// Why a migration runner instead of running SQL manually:
//   Running SQL manually in Supabase dashboard is error-prone and
//   not reproducible. This script runs the same SQL file every time,
//   in every environment, with full logging. One command, consistent results.

// Usage: npm run migrate

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import "dotenv/config";
import { query } from "./index.js";
import { logger } from "../utils/logger.js";

// __dirname equivalent for ES Modules
// In CommonJS __dirname is built-in
// In ES Modules it doesn't exist — we derive it from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const runMigration = async (): Promise<void> => {
    try {
        logger.info("Running database migration...");

        const sql = readFileSync(
            join(__dirname, "migrations", "001_init.sql"),
            "utf8",
        );

        await query(sql);

        logger.info("Migration completed successfully");
        process.exit(0);
    } catch (error) {
        // TypeScript types catch block error as 'unknown'
        // Must check it's an Error before accessing .message
        const message =
            error instanceof Error ? error.message : "Unknown error";
        logger.error("Migration failed", { error: message });
        process.exit(1);
    }
};

runMigration();
