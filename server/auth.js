const jwt = require("jsonwebtoken");

const COOKIE_NAME = "civic_session";

function readCookie(header, name) {
    for (const part of String(header || "").split(";")) {
        const separator = part.indexOf("=");
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() === name) {
            try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
        }
    }
    return null;
}

function createAuthMiddleware(secret, database) {
    if (!secret || Buffer.byteLength(secret) < 32) throw new Error("JWT secret must be at least 32 bytes.");
    return async function authenticate(req, res, next) {
        const token = readCookie(req.headers.cookie, COOKIE_NAME);
        if (!token) return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Sign in to continue." } });
        let claims;
        try {
            claims = jwt.verify(token, secret, { issuer: "civic-platform", algorithms: ["HS256"] });
        } catch {
            res.clearCookie(COOKIE_NAME, cookieOptions());
            return res.status(401).json({ error: { code: "INVALID_SESSION", message: "Your session expired. Please sign in again." } });
        }
        try {
            const result = await database.query("SELECT id, role, department_id FROM users WHERE id = $1", [claims.sub]);
            if (!result.rowCount) {
                res.clearCookie(COOKIE_NAME, cookieOptions());
                return res.status(401).json({ error: { code: "INVALID_SESSION", message: "Your account is no longer available." } });
            }
            const user = result.rows[0];
            req.user = { sub: String(user.id), role: user.role, departmentId: user.department_id ? String(user.department_id) : null };
            return next();
        } catch (error) { return next(error); }
    };
}

function createOptionalAuthMiddleware(secret, database) {
    return async function optionalAuthenticate(req, res, next) {
        const token = readCookie(req.headers.cookie, COOKIE_NAME);
        if (token) {
            let claims;
            try { claims = jwt.verify(token, secret, { issuer: "civic-platform", algorithms: ["HS256"] }); }
            catch { res.clearCookie(COOKIE_NAME, cookieOptions()); }
            if (claims) {
                try {
                    const result = await database.query("SELECT id, role, department_id FROM users WHERE id = $1", [claims.sub]);
                    if (result.rowCount) {
                        const user = result.rows[0];
                        req.user = { sub: String(user.id), role: user.role, departmentId: user.department_id ? String(user.department_id) : null };
                    } else res.clearCookie(COOKIE_NAME, cookieOptions());
                } catch (error) { return next(error); }
            }
        }
        return next();
    };
}

function cookieOptions() {
    return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api" };
}

function issueSession(res, user, secret) {
    const token = jwt.sign({ sub: String(user.id) }, secret, {
        expiresIn: "8h", issuer: "civic-platform", algorithm: "HS256"
    });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: 8 * 60 * 60 * 1000 });
}

function requireRoles(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
        }
        next();
    };
}

module.exports = { COOKIE_NAME, cookieOptions, createAuthMiddleware, createOptionalAuthMiddleware, issueSession, requireRoles };
