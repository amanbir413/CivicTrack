const bcrypt = require("bcryptjs");
const express = require("express");
const { COOKIE_NAME, cookieOptions, issueSession } = require("../auth");
const { createRateLimiter } = require("../rate-limit");

function authError(res, status, code, message) {
    return res.status(status).json({ error: { code, message } });
}

function publicProfile(row) {
    return { id: String(row.id), name: row.name, email: row.email, role: row.role,
        department: row.department_id ? { id: String(row.department_id), name: row.department_name } : null };
}

function createAuthRouter(pool, { secret, authenticate }) {
    const router = express.Router();
    const registrationLimit = createRateLimiter({ limit: 5, windowMs: 15 * 60 * 1000, code: "REGISTRATION_RATE_LIMIT" });
    const loginLimit = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000, code: "LOGIN_RATE_LIMIT" });

    router.post("/register", registrationLimit, async (req, res, next) => {
        const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        if (name.length < 2 || name.length > 80) return authError(res, 400, "INVALID_NAME", "Name must be between 2 and 80 characters.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return authError(res, 400, "INVALID_EMAIL", "Enter a valid email address.");
        if (password.length < 10 || password.length > 200) return authError(res, 400, "INVALID_PASSWORD", "Password must be between 10 and 200 characters.");

        try {
            const passwordHash = await bcrypt.hash(password, 12);
            const result = await pool.query(
                `INSERT INTO users (name, email, password_hash, role)
                 VALUES ($1, $2, $3, 'citizen')
                 RETURNING id, name, email, role, department_id`,
                [name, email, passwordHash]
            );
            issueSession(res, result.rows[0], secret);
            return res.status(201).json({ user: publicProfile(result.rows[0]) });
        } catch (error) {
            if (error.code === "23505") return authError(res, 409, "EMAIL_TAKEN", "An account with this email already exists.");
            return next(error);
        }
    });

    router.post("/login", loginLimit, async (req, res, next) => {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        try {
            const result = await pool.query(
                `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.department_id, d.name AS department_name
                 FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.email = $1`, [email]
            );
            if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
                return authError(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
            }
            issueSession(res, result.rows[0], secret);
            return res.json({ user: publicProfile(result.rows[0]) });
        } catch (error) { return next(error); }
    });

    router.post("/logout", (_req, res) => {
        res.clearCookie(COOKIE_NAME, cookieOptions());
        return res.status(204).end();
    });

    router.get("/me", authenticate, async (req, res, next) => {
        try {
            const result = await pool.query(
                `SELECT u.id, u.name, u.email, u.role, u.department_id, d.name AS department_name
                 FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = $1`, [req.user.sub]
            );
            if (!result.rowCount) return authError(res, 401, "INVALID_SESSION", "Your account is no longer available.");
            return res.json({ user: publicProfile(result.rows[0]) });
        } catch (error) { return next(error); }
    });

    return router;
}

module.exports = { createAuthRouter, publicProfile };
