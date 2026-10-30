const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const express = require("express");
const { pool } = require("./db");
const { createComplaintRouter } = require("./routes/complaints");
const { createAuthRouter } = require("./routes/auth");
const { createOfficerRouter, createAdminRouter } = require("./routes/officer");
const { createAuthMiddleware, createOptionalAuthMiddleware } = require("./auth");
const { createStorage } = require("./storage");
const { startEscalationScheduler } = require("./escalation");

const projectRoot = path.resolve(__dirname, "..");
const jwtSecret = process.env.JWT_SECRET;
const demoJwtSecret = "civic-demo-only-public-signing-key-not-for-production-2026";
if (process.env.NODE_ENV === "production" && jwtSecret === demoJwtSecret) {
    throw new Error("The public demo JWT_SECRET cannot be used when NODE_ENV=production.");
}
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 bytes.");
}

function createApp(database = pool, secret = jwtSecret, options = {}) {
    const app = express();
    const storage = options.storage || createStorage();
    const authenticate = createAuthMiddleware(secret, database);
    const optionalAuthenticate = createOptionalAuthMiddleware(secret, database);

    app.disable("x-powered-by");
    const liveServerOrigins = new Set(["http://localhost:5500", "http://127.0.0.1:5500"]);
    app.use((req, res, next) => {
        const origin = req.headers.origin;
        if (!req.path.startsWith("/api/") || !liveServerOrigins.has(origin)) return next();
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Vary", "Origin");
        if (req.method === "OPTIONS") return res.status(204).end();
        return next();
    });
    app.use(express.json({ limit: "32kb" }));

    app.get("/api/health", async (_req, res) => {
        try {
            await database.query("SELECT 1");
            return res.json({ status: "ok", database: "connected" });
        } catch {
            return res.status(503).json({ status: "error", database: "unavailable" });
        }
    });

    app.use("/api/auth", createAuthRouter(database, { secret, authenticate }));
    app.use("/api/complaints", createComplaintRouter(database, authenticate, optionalAuthenticate));
    app.use("/api/officer", createOfficerRouter(database, authenticate, storage));
    app.use("/api/admin", createAdminRouter(database, authenticate));

    app.get("/api/evidence/:mediaId", authenticate, async (req, res, next) => {
        try {
            if (!/^\d+$/.test(req.params.mediaId)) return res.status(400).json({ error: { code: "INVALID_MEDIA_ID", message: "Invalid evidence ID." } });
            const result = await database.query(`SELECT m.object_key,m.mime_type,c.user_id,c.department_id
                FROM complaint_media m JOIN complaints c ON c.id=m.complaint_id WHERE m.id=$1`, [req.params.mediaId]);
            if (!result.rowCount) return res.status(404).json({ error: { code: "EVIDENCE_NOT_FOUND", message: "Evidence was not found." } });
            const media = result.rows[0];
            const allowed = req.user.role === "administrator" || (req.user.role === "citizen" && String(media.user_id) === req.user.sub)
                || (req.user.role === "officer" && String(media.department_id) === req.user.departmentId);
            if (!allowed) return res.status(403).json({ error: { code: "FORBIDDEN", message: "You cannot access this evidence." } });
            const buffer = await storage.get(media.object_key);
            res.set({ "Content-Type": media.mime_type, "Content-Length": String(buffer.length), "Content-Disposition": "inline", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
            return res.send(buffer);
        } catch (error) { return next(error); }
    });

    app.get("/", (_req, res) => res.sendFile(path.join(projectRoot, "index.html")));
    app.get("/index.html", (_req, res) => res.sendFile(path.join(projectRoot, "index.html")));
    app.get("/style.css", (_req, res) => res.sendFile(path.join(projectRoot, "style.css")));
    app.get("/i18n.js", (_req, res) => res.sendFile(path.join(projectRoot, "i18n.js")));
    app.get("/script.js", (_req, res) => res.sendFile(path.join(projectRoot, "script.js")));

    app.use("/api", (_req, res) => {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "API endpoint not found." } });
    });

    app.use((error, _req, res, _next) => {
        if (error.type === "entity.parse.failed") {
            return res.status(400).json({
                error: { code: "INVALID_JSON", message: "Request body must contain valid JSON." }
            });
        }
        if (error.type === "entity.too.large") {
            return res.status(413).json({
                error: { code: req.path.includes("/evidence") ? "UPLOAD_TOO_LARGE" : "REQUEST_TOO_LARGE",
                    message: req.path.includes("/evidence") ? "Evidence upload must be 5 MB or smaller." : "Request body exceeds the 32 KB limit." }
            });
        }

        const statusCode = error.statusCode || 500;
        if (statusCode >= 500) console.error("Request failed:", error.code || error.message || error);
        return res.status(statusCode).json({
            error: {
                code: error.code || "INTERNAL_ERROR",
                message: statusCode >= 500 ? "The request could not be completed. Check the server and database logs." : error.message
            }
        });
    });
    return app;
}

const app = createApp();

if (require.main === module) {
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, () => console.log(`Civic platform listening on http://localhost:${port}`));
    startEscalationScheduler(pool);
}

module.exports = { app, createApp };
