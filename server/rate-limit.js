function createRateLimiter({ limit, windowMs, code }) {
    const windows = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || "unknown";
        let entry = windows.get(key);
        if (!entry || now >= entry.resetAt) entry = { count: 0, resetAt: now + windowMs };
        entry.count += 1;
        windows.set(key, entry);
        if (windows.size > 5000) for (const [ip, item] of windows) if (now >= item.resetAt) windows.delete(ip);
        if (entry.count > limit) {
            res.set("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
            return res.status(429).json({ error: { code, message: "Too many requests. Please wait and try again." } });
        }
        return next();
    };
}

module.exports = { createRateLimiter };
