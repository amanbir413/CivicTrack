const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env and configure the database connection.");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
});

pool.on("error", error => {
    console.error("Unexpected idle PostgreSQL connection error:", error.code || error.message || error);
});

module.exports = { pool };
