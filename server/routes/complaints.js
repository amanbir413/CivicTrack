const { randomUUID } = require("node:crypto");
const express = require("express");
const { parseMultipart } = require("../upload");
const { normalizeComplaintInput } = require("../validation/complaints");
const { requireRoles } = require("../auth");
const { CATEGORIES } = require("../validation/complaints");
const { createRateLimiter } = require("../rate-limit");
const { assessPriority, reviewReportContent } = require("../priority");

const DEFAULT_RADIUS_METERS = 1000;
const DEFAULT_LOOKBACK_DAYS = 30;

function duplicateSearchConfig(env = process.env) {
    const radius = Number(env.DUPLICATE_RADIUS_METERS);
    const days = Number(env.DUPLICATE_LOOKBACK_DAYS);
    return {
        radiusMeters: Number.isFinite(radius) && radius >= 50 && radius <= 10000 ? radius : DEFAULT_RADIUS_METERS,
        lookbackDays: Number.isFinite(days) && days >= 1 && days <= 3650 ? days : DEFAULT_LOOKBACK_DAYS
    };
}

function apiError(statusCode, code, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    error.code = code;
    return error;
}

async function findComplaint(db, ticketId) {
    const result = await db.query(
        `SELECT c.id, c.ticket_id, c.title, c.description, c.status,
                c.created_at, c.updated_at, c.due_at,
                c.priority_level, c.priority_reason, c.priority_source, c.priority_assessed_at,
                c.latitude, c.longitude, c.map_x, c.map_y, c.user_id, c.closed_at,
                (c.status <> 'closed' AND c.due_at < CURRENT_TIMESTAMP) AS is_overdue,
                EXISTS (SELECT 1 FROM complaint_events escal WHERE escal.complaint_id=c.id AND escal.event_type='escalated') AS is_escalated,
                cat.slug AS category_slug, cat.label AS category_label,
                d.id AS department_id, d.slug AS department_slug, d.name AS department_name
         FROM complaints c
         JOIN issue_categories cat ON cat.id = c.category_id
         JOIN departments d ON d.id = c.department_id
         WHERE c.ticket_id = $1`,
        [ticketId]
    );

    if (!result.rowCount) return null;
    const row = result.rows[0];
    const eventResult = await db.query(
        `SELECT event_type, previous_status, new_status, note, created_at
         FROM complaint_events
         WHERE complaint_id = $1
         ORDER BY created_at ASC, id ASC`,
        [row.id]
    );

    return {
        id: String(row.id),
        ownerId: row.user_id === null ? null : String(row.user_id),
        ticketId: row.ticket_id,
        title: row.title,
        description: row.description,
        category: { slug: row.category_slug, label: row.category_label },
        department: { id: String(row.department_id), slug: row.department_slug, name: row.department_name },
        status: row.status,
        priority: {
            level: row.priority_level,
            reason: row.priority_reason,
            source: row.priority_source,
            assessedAt: row.priority_assessed_at
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        dueAt: row.due_at,
        closedAt: row.closed_at,
        isOverdue: row.is_overdue,
        isEscalated: row.is_escalated,
        location: {
            latitude: row.latitude === null ? null : Number(row.latitude),
            longitude: row.longitude === null ? null : Number(row.longitude),
            mapX: row.map_x === null ? null : Number(row.map_x),
            mapY: row.map_y === null ? null : Number(row.map_y)
        },
        events: eventResult.rows.map(event => ({
            eventType: event.event_type,
            previousStatus: event.previous_status,
            newStatus: event.new_status,
            note: event.note,
            createdAt: event.created_at
        }))
    };
}

function publicComplaint(complaint) {
    return {
        ticketId: complaint.ticketId,
        category: complaint.category,
        department: complaint.department,
        status: complaint.status,
        createdAt: complaint.createdAt,
        updatedAt: complaint.updatedAt,
        dueAt: complaint.dueAt,
        isOverdue: complaint.isOverdue,
        isEscalated: complaint.isEscalated,
        events: complaint.events.map(event => ({
            eventType: event.eventType,
            previousStatus: event.previousStatus,
            newStatus: event.newStatus,
            createdAt: event.createdAt
        }))
    };
}

function withoutOwner(complaint) {
    const { ownerId, ...publicFields } = complaint;
    return publicFields;
}

function createComplaintRouter(pool, authenticate, optionalAuthenticate = (_req, _res, next) => next(), storage) {
    const router = express.Router();
    router.post("/suggestions", authenticate, requireRoles("citizen"), async (req, res, next) => {
        const category = typeof req.body?.category === "string" ? req.body.category.trim().toLowerCase() : "";
        const latitude = req.body?.location?.latitude, longitude = req.body?.location?.longitude;
        if (!CATEGORIES.has(category)) return res.status(400).json({ error: { code: "INVALID_CATEGORY", message: "Choose a valid complaint category." } });
        if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
            || typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
            return res.status(400).json({ error: { code: "LOCATION_REQUIRED", message: "Select a real map location to find nearby reports." } });
        }
        const { radiusMeters, lookbackDays } = duplicateSearchConfig();
        try {
            const result = await pool.query(`WITH candidates AS (
                SELECT c.ticket_id,c.status,c.due_at,c.created_at,cat.slug AS category_slug,cat.label AS category_label,
                    2*6371000*asin(sqrt(least(1,
                        power(sin(radians(c.latitude-$2::double precision)/2),2)
                        + cos(radians($2::double precision))*cos(radians(c.latitude))
                        * power(sin(radians(c.longitude-$3::double precision)/2),2)
                    ))) AS distance_meters
                FROM complaints c JOIN issue_categories cat ON cat.id=c.category_id
                WHERE cat.slug=$1 AND c.status <> 'closed'
                    AND c.created_at >= CURRENT_TIMESTAMP - ($5::double precision * INTERVAL '1 day')
                    AND c.latitude BETWEEN $2::double precision-($4::double precision/111320)
                        AND $2::double precision+($4::double precision/111320)
                    AND c.longitude BETWEEN $3::double precision-($4::double precision/(111320*GREATEST(abs(cos(radians($2::double precision))),0.01)))
                        AND $3::double precision+($4::double precision/(111320*GREATEST(abs(cos(radians($2::double precision))),0.01)))
            )
            SELECT candidates.ticket_id,candidates.status,candidates.due_at,candidates.created_at,candidates.category_slug,candidates.category_label,
                round(candidates.distance_meters)::int AS distance_meters, count(s.user_id)::int AS support_count,
                bool_or(s.user_id=$6::bigint) AS supported_by_me
            FROM candidates LEFT JOIN complaint_support s ON s.complaint_id=(SELECT id FROM complaints WHERE ticket_id=candidates.ticket_id)
            WHERE candidates.distance_meters <= $4 GROUP BY candidates.ticket_id,candidates.status,candidates.due_at,candidates.created_at,candidates.category_slug,candidates.category_label,candidates.distance_meters
            ORDER BY candidates.distance_meters,candidates.created_at DESC LIMIT 8`,
            [category, latitude, longitude, radiusMeters, lookbackDays, req.user.sub]);
            return res.json({ suggestions: result.rows.map(row => ({ ticketId: row.ticket_id, category: { slug: row.category_slug, label: row.category_label },
                status: row.status, distanceMeters: row.distance_meters, createdAt: row.created_at, dueAt: row.due_at,
                supportCount: row.support_count, supportedByMe: row.supported_by_me === true })),
                radiusMeters, lookbackDays, note: "Suggestions are separate reports. They are never merged automatically." });
        } catch (error) { return next(error); }
    });

    router.post("/:ticketId/support", authenticate, requireRoles("citizen"), async (req, res, next) => {
        const ticketId = req.params.ticketId.trim().toUpperCase();
        if (!/^CIV-[A-F0-9]{16}$/.test(ticketId)) return res.status(400).json({ error: { code: "INVALID_TICKET_ID", message: "Invalid ticket ID." } });
        try {
            const result = await pool.query(`WITH target AS (
                SELECT id,ticket_id,status FROM complaints WHERE ticket_id=$1 AND status <> 'closed'
            ), added AS (
                INSERT INTO complaint_support (complaint_id,user_id)
                SELECT id,$2 FROM target ON CONFLICT (complaint_id,user_id) DO NOTHING RETURNING complaint_id
            )
            SELECT target.ticket_id,target.status,(SELECT count(*)::int FROM complaint_support WHERE complaint_id=target.id) AS support_count,
                EXISTS (SELECT 1 FROM complaint_support WHERE complaint_id=target.id AND user_id=$2) AS supported_by_me
            FROM target`, [ticketId, req.user.sub]);
            if (!result.rowCount) throw apiError(404, "TICKET_NOT_FOUND", "No open complaint was found for that ticket ID.");
            return res.json({ ticketId: result.rows[0].ticket_id, status: result.rows[0].status,
                supportCount: result.rows[0].support_count, supportedByMe: result.rows[0].supported_by_me });
        } catch (error) { return next(error); }
    });

    router.get("/map", async (req, res, next) => {
        const category = typeof req.query.category === "string" && req.query.category !== "all" ? req.query.category : null;
        if (category && !CATEGORIES.has(category)) return res.status(400).json({ error: { code: "INVALID_CATEGORY", message: "Unknown map category." } });
        const statuses = new Set(["assigned", "in_progress", "resolution_pending_confirmation", "reopened", "closed", "overdue", "escalated"]);
        const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : null;
        if (status && !statuses.has(status)) return res.status(400).json({ error: { code: "INVALID_STATUS", message: "Unknown map status." } });
        try {
            const result = await pool.query(`SELECT c.ticket_id,c.latitude,c.longitude,c.status,c.created_at,c.due_at,
                cat.slug AS category_slug,cat.label AS category_label,
                (c.status <> 'closed' AND c.due_at < CURRENT_TIMESTAMP) AS is_overdue,
                EXISTS (SELECT 1 FROM complaint_events e WHERE e.complaint_id=c.id AND e.event_type='escalated') AS is_escalated
                FROM complaints c JOIN issue_categories cat ON cat.id=c.category_id
                WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
                    AND ($1::text IS NULL OR cat.slug=$1)
                    AND ($2::text IS NULL OR c.status=$2
                        OR ($2='overdue' AND c.status <> 'closed' AND c.due_at < CURRENT_TIMESTAMP)
                        OR ($2='escalated' AND EXISTS (SELECT 1 FROM complaint_events e WHERE e.complaint_id=c.id AND e.event_type='escalated')))
                ORDER BY c.created_at DESC LIMIT 1000`, [category, status]);
            return res.json({ reports: result.rows.map(row => ({ ticketId: row.ticket_id, latitude: Number(Number(row.latitude).toFixed(3)), longitude: Number(Number(row.longitude).toFixed(3)),
                category: { slug: row.category_slug, label: row.category_label }, status: row.status, createdAt: row.created_at, dueAt: row.due_at,
                isOverdue: row.is_overdue, isEscalated: row.is_escalated })) });
        } catch (error) { return next(error); }
    });

    router.post("/validate-content", authenticate, requireRoles("citizen"), express.raw({ type: "multipart/form-data", limit: "5.2mb" }), async (req, res, next) => {
        try {
            const file = parseMultipart(req);
            const result = await reviewReportContent({ title: req.query.title, description: req.query.description, category: req.query.category, image: file.buffer, mimeType: file.mimeType });
            if (!result.available) throw apiError(503, "CONTENT_REVIEW_UNAVAILABLE", "Report review is temporarily unavailable. Please try again shortly.");
            if (!result.relevant) throw apiError(422, "REPORT_NOT_RELEVANT", result.reason || "The report text and photo do not appear relevant to the selected civic issue.");
            return res.json({ valid: true });
        } catch (error) { return next(error); }
    });

    router.post("/:ticketId/photo", authenticate, requireRoles("citizen"), express.raw({ type: "multipart/form-data", limit: "5.2mb" }), async (req, res, next) => {
        let client, objectKey;
        try {
            if (!/^CIV-[A-F0-9]{16}$/i.test(req.params.ticketId.trim())) throw apiError(400, "INVALID_TICKET_ID", "Invalid ticket ID.");
            const file = parseMultipart(req);
            client = await pool.connect(); await client.query("BEGIN");
            const found = await client.query("SELECT id,user_id,status,title,description FROM complaints WHERE ticket_id=$1 FOR UPDATE", [req.params.ticketId.trim().toUpperCase()]);
            if (!found.rowCount) throw apiError(404, "TICKET_NOT_FOUND", "No saved complaint was found for that ticket ID.");
            const complaint = found.rows[0];
            if (String(complaint.user_id) !== req.user.sub) throw apiError(403, "FORBIDDEN", "Only the citizen who submitted this complaint may attach its report photo.");
            if (complaint.status !== "assigned") throw apiError(409, "INVALID_PHOTO_STATE", "A report photo can only be attached before department work begins.");
            const category = await client.query("SELECT label FROM issue_categories WHERE id=(SELECT category_id FROM complaints WHERE id=$1)", [complaint.id]);
            const contentReview = await reviewReportContent({ title: complaint.title, description: complaint.description, category: category.rows[0]?.label, image: file.buffer, mimeType: file.mimeType });
            if (!contentReview.available) throw apiError(503, "CONTENT_REVIEW_UNAVAILABLE", "Photo review is temporarily unavailable. Please try again shortly.");
            if (!contentReview.relevant) throw apiError(422, "PHOTO_NOT_RELEVANT", contentReview.reason || "This photo does not appear to show the reported civic issue.");
            objectKey = await storage.put(file.buffer, file.extension);
            const inserted = await client.query(
                `INSERT INTO complaint_media (complaint_id,uploader_user_id,object_key,original_name,mime_type,byte_size,media_kind)
                 VALUES ($1,$2,$3,$4,$5,$6,'report') RETURNING id,mime_type,byte_size,created_at,media_kind`,
                [complaint.id, req.user.sub, objectKey, file.originalName, file.mimeType, file.buffer.length]
            );
            await client.query(`INSERT INTO complaint_events (complaint_id,event_type,actor_type,actor_user_id,note)
                VALUES ($1,'report_photo_uploaded','citizen',$2,'Citizen attached a live report photo.')`, [complaint.id, req.user.sub]);
            await client.query("COMMIT");
            const media = inserted.rows[0];
            return res.status(201).json({ photo: { id: String(media.id), mimeType: media.mime_type, byteSize: media.byte_size, kind: media.media_kind, createdAt: media.created_at } });
        } catch (error) {
            if (client) { try { await client.query("ROLLBACK"); } catch {} }
            if (objectKey) await storage.delete(objectKey);
            if (error.type === "entity.too.large" || error.code === "UPLOAD_TOO_LARGE") return res.status(413).json({ error: { code: "UPLOAD_TOO_LARGE", message: "Report photos must be 5 MB or smaller." } });
            return next(error);
        } finally { if (client) client.release(); }
    });
    router.post("/", authenticate, requireRoles("citizen"), createRateLimiter({ limit: 10, windowMs: 60_000, code: "REPORT_RATE_LIMIT" }), async (req, res, next) => {
        const normalized = normalizeComplaintInput(req.body);
        if (normalized.error) {
            return res.status(400).json({ error: normalized.error });
        }

        let client;
        try {
            const { title, description, category, location } = normalized.value;
            const categoryResult = await pool.query(
                `SELECT id, department_id, sla_hours, label
                 FROM issue_categories
                 WHERE slug = $1 AND active = TRUE`,
                [category]
            );
            if (!categoryResult.rowCount) {
                throw apiError(400, "INVALID_CATEGORY", "That complaint category is not available.");
            }

            const mapping = categoryResult.rows[0];
            const textReview = await reviewReportContent({ title, description, category: mapping.label });
            if (!textReview.available) throw apiError(503, "CONTENT_REVIEW_UNAVAILABLE", "Report review is temporarily unavailable. Please try again shortly.");
            if (!textReview.relevant) throw apiError(422, "REPORT_NOT_RELEVANT", textReview.reason || "The report text does not appear relevant to the selected civic issue.");
            const language = ["en", "hi", "pa"].includes(req.body?.language) ? req.body.language : "en";
            const priority = await assessPriority({ title, description, category: mapping.label, language });
            client = await pool.connect();
            await client.query("BEGIN");
            const ticketId = `CIV-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
            const inserted = await client.query(
                `INSERT INTO complaints
                    (ticket_id, title, description, category_id, department_id, user_id, status,
                     latitude, longitude, map_x, map_y, due_at, priority_level, priority_reason, priority_source)
                 VALUES
                    ($1, $2, $3, $4, $5, $6, 'assigned', $7, $8, $9, $10,
                     CURRENT_TIMESTAMP + ($11 * INTERVAL '1 hour'), $12, $13, $14)
                 RETURNING id`,
                [ticketId, title, description, mapping.id, mapping.department_id, req.user.sub,
                    location.latitude, location.longitude, location.mapX, location.mapY, mapping.sla_hours,
                    priority.level, priority.reason, priority.source]
            );

            await client.query(
                `INSERT INTO complaint_events
                    (complaint_id, event_type, actor_type, actor_user_id, previous_status, new_status, note)
                 VALUES ($1, 'submitted', 'citizen', $2, NULL, 'assigned', $3)`,
                [inserted.rows[0].id, req.user.sub, "Complaint submitted and assigned to the responsible department."]
            );

            await client.query(
                `INSERT INTO complaint_events (complaint_id,event_type,actor_type,note)
                 VALUES ($1,'priority_assessed','system',$2)`,
                [inserted.rows[0].id, `Priority recommendation (${priority.source}): ${priority.level}. ${priority.reason}`]
            );

            const complaint = await findComplaint(client, ticketId);
            await client.query("COMMIT");
            return res.status(201).json({ complaint: withoutOwner(complaint) });
        } catch (error) {
            if (client) {
                try {
                    await client.query("ROLLBACK");
                } catch {
                    // Preserve the original database error.
                }
            }
            return next(error);
        } finally {
            if (client) client.release();
        }
    });

    router.post("/:ticketId/confirmation", authenticate, requireRoles("citizen"), async (req, res, next) => {
        const decision = req.body?.decision;
        if (!["confirm", "reject"].includes(decision)) return res.status(400).json({ error: { code: "INVALID_DECISION", message: "Decision must be confirm or reject." } });
        const ticketId = req.params.ticketId.trim().toUpperCase();
        if (!/^CIV-[A-F0-9]{16}$/.test(ticketId)) return res.status(400).json({ error: { code: "INVALID_TICKET_ID", message: "Invalid ticket ID." } });
        let client;
        try {
            client = await pool.connect(); await client.query("BEGIN");
            const found = await client.query("SELECT id,user_id,status FROM complaints WHERE ticket_id=$1 FOR UPDATE", [ticketId]);
            if (!found.rowCount) throw apiError(404, "TICKET_NOT_FOUND", "No saved complaint was found for that ticket ID.");
            const current = found.rows[0];
            if (String(current.user_id) !== req.user.sub) throw apiError(403, "FORBIDDEN", "Only the citizen who submitted this complaint may respond.");
            if (current.status !== "resolution_pending_confirmation") throw apiError(409, "INVALID_TRANSITION", "This complaint is not awaiting citizen confirmation.");
            const nextStatus = decision === "confirm" ? "closed" : "reopened";
            const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 1000) : "";
            await client.query("UPDATE complaints SET status=$1, closed_at=CASE WHEN $1='closed' THEN CURRENT_TIMESTAMP ELSE NULL END, updated_at=CURRENT_TIMESTAMP WHERE id=$2", [nextStatus, current.id]);
            await client.query(`INSERT INTO complaint_events (complaint_id,event_type,actor_type,actor_user_id,previous_status,new_status,note)
                VALUES ($1,$2,'citizen',$3,'resolution_pending_confirmation',$4,$5)`,
                [current.id, decision === "confirm" ? "citizen_confirmed" : "reopened", req.user.sub, nextStatus,
                    decision === "confirm" ? "Citizen confirmed the resolution." : (note || "Citizen rejected the proposed resolution; work reopened.")]);
            const complaint = await findComplaint(client, ticketId);
            await client.query("COMMIT"); return res.json({ complaint: withoutOwner(complaint) });
        } catch (error) { if (client) { try { await client.query("ROLLBACK"); } catch {} } return next(error); }
        finally { if (client) client.release(); }
    });

    router.get("/mine", authenticate, requireRoles("citizen"), async (req, res, next) => {
        try {
            const result = await pool.query(
                `SELECT ticket_id FROM complaints WHERE user_id = $1 ORDER BY created_at DESC`, [req.user.sub]
            );
            const complaints = [];
            for (const row of result.rows) complaints.push(withoutOwner(await findComplaint(pool, row.ticket_id)));
            return res.json({ complaints });
        } catch (error) { return next(error); }
    });

    router.get("/:ticketId", optionalAuthenticate, async (req, res, next) => {
        const ticketId = req.params.ticketId.trim().toUpperCase();
        if (!/^CIV-[A-F0-9]{16}$/.test(ticketId)) {
            return res.status(400).json({
                error: { code: "INVALID_TICKET_ID", message: "Enter a ticket ID in the form CIV-XXXXXXXXXXXXXXXX." }
            });
        }

        try {
            const complaint = await findComplaint(pool, ticketId);
            if (!complaint) {
                return res.status(404).json({
                    error: { code: "TICKET_NOT_FOUND", message: "No saved complaint was found for that ticket ID." }
                });
            }
            if (req.user && (req.user.role === "administrator" || req.user.sub === complaint.ownerId
                || (req.user.role === "officer" && String(req.user.departmentId) === String(complaint.department.id)))) {
                const media = await pool.query("SELECT id,mime_type,byte_size,created_at,media_kind FROM complaint_media WHERE complaint_id=$1 ORDER BY created_at,id", [complaint.id]);
                complaint.evidence = media.rows.map(row => ({ id: String(row.id), mimeType: row.mime_type, byteSize: row.byte_size, kind: row.media_kind, createdAt: row.created_at }));
                complaint.viewerIsOwner = req.user?.role === "citizen" && req.user.sub === complaint.ownerId;
                return res.json({ complaint: withoutOwner(complaint) });
            }
            return res.json({ complaint: publicComplaint(complaint) });
        } catch (error) {
            return next(error);
        }
    });

    return router;
}

module.exports = { createComplaintRouter, duplicateSearchConfig, findComplaint, publicComplaint, withoutOwner };
