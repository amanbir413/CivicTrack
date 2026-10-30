const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is missing. Copy .env.example to .env and configure the database connection.");
    process.exitCode = 1;
} else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    async function migrate() {
        const client = await pool.connect();
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            `);

            const migrationDirectory = path.join(__dirname, "migrations");
            const files = fs.readdirSync(migrationDirectory)
                .filter(file => file.endsWith(".sql"))
                .sort();

            for (const file of files) {
                const applied = await client.query(
                    "SELECT 1 FROM schema_migrations WHERE version = $1",
                    [file]
                );
                if (applied.rowCount) {
                    console.log(`Already applied: ${file}`);
                    continue;
                }

                await client.query("BEGIN");
                try {
                    await client.query(fs.readFileSync(path.join(migrationDirectory, file), "utf8"));
                    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
                    await client.query("COMMIT");
                    console.log(`Applied: ${file}`);
                } catch (error) {
                    await client.query("ROLLBACK");
                    throw error;
                }
            }
        } finally {
            client.release();
        }
    }

    migrate()
        .catch(error => {
            console.error("Database migration failed:", error.code || error.message || error);
            process.exitCode = 1;
        })
        .finally(() => pool.end());
}
