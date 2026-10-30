const express = require("express");
const { requireRoles } = require("../auth");
const { findComplaint } = require("./complaints");
const { parseMultipart } = require("../upload");
const { PRIORITY_LEVELS } = require("../priority");

const TRANSITIONS = { assigned: "in_progress", in_progress: "resolution_pending_confirmation", reopened: "in_progress" };
function apiError(status, code, message) { return Object.assign(new Error(message), { statusCode: status, code }); }
function mayAccessDepartment(user, departmentId) { return user.role === "administrator" || (user.role === "officer" && String(user.departmentId) === String(departmentId)); }
function mediaList(rows) { return rows.map(row => ({ id: String(row.id), mimeType: row.mime_type, byteSize: row.byte_size, kind: row.media_kind, createdAt: row.created_at })); }

function createOfficerRouter(pool, authenticate, storage) {
    const router = express.Router();
    const staffOnly = [authenticate, requireRoles("officer", "administrator")];

    router.get("/rankings", async (_req, res, next) => {
        try {
            const result = await pool.query(`WITH resolved_cases AS (
                    SELECT c.id,c.closed_at,c.due_at,resolver.actor_user_id AS officer_id
                    FROM complaints c
                    JOIN LATERAL (
                        SELECT actor_user_id,actor_type FROM complaint_events
                        WHERE complaint_id=c.id AND event_type='status_changed'
                            AND new_status='resolution_pending_confirmation'
                        ORDER BY created_at DESC,id DESC LIMIT 1
                    ) resolver ON resolver.actor_user_id IS NOT NULL AND resolver.actor_type='officer'
                    WHERE c.status='closed'
                ), case_stats AS (
                    SELECT officer_id,count(*)::int AS closed_cases,
                        count(*) FILTER (WHERE closed_at<=due_at)::int AS on_time_cases
                    FROM resolved_cases GROUP BY officer_id
                ), feedback_stats AS (
                    SELECT officer_id,count(*)::int AS rating_count,
                        round(avg(rating)::numeric,1) AS average_rating
                    FROM officer_feedback GROUP BY officer_id
                )
                SELECT u.id,u.name,d.name AS department_name,
                    COALESCE(c.closed_cases,0)::int AS closed_cases,
                    COALESCE(c.on_time_cases,0)::int AS on_time_cases,
                    COALESCE(f.rating_count,0)::int AS rating_count,
                    f.average_rating
                FROM users u JOIN departments d ON d.id=u.department_id
                LEFT JOIN case_stats c ON c.officer_id=u.id
                LEFT JOIN feedback_stats f ON f.officer_id=u.id
                WHERE u.role='officer'
                ORDER BY f.average_rating DESC NULLS LAST,f.rating_count DESC,closed_cases DESC,u.name COLLATE "C"`);
            return res.json({ rankings: result.rows.map((row, index) => ({
                id: String(row.id), name: row.name, department: row.department_name,
                rank: row.average_rating === null ? null : index + 1,
                rating: row.average_rating === null ? null : Number(row.average_rating),
                ratingCount: row.rating_count, closedCases: row.closed_cases,
                onTimePercent: row.closed_cases ? Math.round(row.on_time_cases * 100 / row.closed_cases) : null
            })) });
        } catch (error) { return next(error); }
    });

    router.get("/queue", ...staffOnly, async (req, res, next) => {
        try {
            const departmentId = req.user.role === "officer" ? req.user.departmentId : req.query.departmentId;
            if (departmentId && !/^\d+$/.test(String(departmentId))) return res.status(400).json({ error: { code: "INVALID_DEPARTMENT", message: "Department ID must be numeric." } });
            const result = await pool.query(
                `SELECT c.ticket_id FROM complaints c WHERE ($1::bigint IS NULL OR c.department_id = $1::bigint)
                 ORDER BY CASE WHEN c.status IN ('assigned','in_progress','reopened') THEN 0
                               WHEN c.status='resolution_pending_confirmation' THEN 1 ELSE 2 END ASC,
                          CASE c.priority_level WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END ASC,
                          (c.due_at > CURRENT_TIMESTAMP) ASC, c.due_at ASC`, [departmentId || null]
            );
            const queue = [];
            for (const row of result.rows) { const complaint = await findComplaint(pool, row.ticket_id); delete complaint.ownerId; queue.push(complaint); }
            return res.json({ queue, departmentId: departmentId ? String(departmentId) : null });
        } catch (error) { return next(error); }
    });

    router.get("/counts", ...staffOnly, async (req, res, next) => {
        const departmentId = req.user.role === "officer" ? req.user.departmentId : req.query.departmentId || null;
        if (departmentId && !/^\d+$/.test(String(departmentId))) return res.status(400).json({ error: { code: "INVALID_DEPARTMENT", message: "Department ID must be numeric." } });
        try {
            const result = await pool.query(`SELECT status, count(*)::int AS count FROM complaints WHERE ($1::bigint IS NULL OR department_id = $1::bigint) GROUP BY status`, [departmentId]);
            return res.json({ departmentId: departmentId ? String(departmentId) : null, counts: Object.fromEntries(result.rows.map(row => [row.status, row.count])) });
        } catch (error) { return next(error); }
    });

    router.get("/complaints/:ticketId", ...staffOnly, async (req, res, next) => {
        try {
            const ticketId = req.params.ticketId.trim().toUpperCase();
            if (!/^CIV-[A-F0-9]{16}$/.test(ticketId)) return res.status(400).json({ error: { code: "INVALID_TICKET_ID", message: "Invalid ticket ID." } });
            const complaint = await findComplaint(pool, ticketId);
            if (!complaint) return res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "No saved complaint was found for that ticket ID." } });
            if (!mayAccessDepartment(req.user, complaint.department.id)) return res.status(403).json({ error: { code: "FORBIDDEN", message: "This complaint belongs to another department." } });
            const media = await pool.query("SELECT id,mime_type,byte_size,created_at,media_kind FROM complaint_media WHERE complaint_id=$1 ORDER BY created_at,id", [complaint.id]);
            complaint.evidence = mediaList(media.rows); delete complaint.ownerId;
            return res.json({ complaint });
        } catch (error) { return next(error); }
    });

    router.post("/complaints/:ticketId/evidence", ...staffOnly, express.raw({ type: "multipart/form-data", limit: "5.2mb" }), async (req, res, next) => {
        let client, objectKey;
        try {
            const file = parseMultipart(req);
            client = await pool.connect(); await client.query("BEGIN");
            const found = await client.query("SELECT id,status,department_id FROM complaints WHERE ticket_id=$1 FOR UPDATE", [req.params.ticketId.trim().toUpperCase()]);
            if (!found.rowCount) throw apiError(404, "TICKET_NOT_FOUND", "No saved complaint was found for that ticket ID.");
            const complaint = found.rows[0];
            if (!mayAccessDepartment(req.user, complaint.department_id)) throw apiError(403, "FORBIDDEN", "This complaint belongs to another department.");
            if (complaint.status !== "in_progress") throw apiError(409, "INVALID_EVIDENCE_STATE", "Evidence can be added while work is in progress.");
            objectKey = await storage.put(file.buffer, file.extension);
            const inserted = await client.query(
                `INSERT INTO complaint_media (complaint_id,uploader_user_id,object_key,original_name,mime_type,byte_size)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,mime_type,byte_size,created_at,media_kind`,
                [complaint.id, req.user.sub, objectKey, file.originalName, file.mimeType, file.buffer.length]
            );
            await client.query(`INSERT INTO complaint_events (complaint_id,event_type,actor_type,actor_user_id,note)
                VALUES ($1,'evidence_uploaded',$2,$3,$4)`, [complaint.id, req.user.role, req.user.sub, "Resolution evidence uploaded."]);
            await client.query("COMMIT");
            return res.status(201).json({ evidence: mediaList(inserted.rows)[0] });
        } catch (error) {
            if (client) { try { await client.query("ROLLBACK"); } catch {} }
            if (objectKey) await storage.delete(objectKey);
            if (error.type === "entity.too.large") return res.status(413).json({ error: { code: "UPLOAD_TOO_LARGE", message: "Evidence images must be 5 MB or smaller." } });
            return next(error);
        } finally { if (client) client.release(); }
    });

    router.patch("/complaints/:ticketId/priority", ...staffOnly, async (req, res, next) => {
        const ticketId = req.params.ticketId.trim().toUpperCase();
        const { priorityLevel, reason } = req.body || {};
        if (!/^CIV-[A-F0-9]{16}$/.test(ticketId)) return res.status(400).json({ error: { code: "INVALID_TICKET_ID", message: "Invalid ticket ID." } });
        if (!PRIORITY_LEVELS.includes(priorityLevel)) return res.status(400).json({ error: { code: "INVALID_PRIORITY", message: "Choose critical, high, normal, or low priority." } });
        if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 500) {
            return res.status(400).json({ error: { code: "INVALID_PRIORITY_REASON", message: "Enter a reason of up to 500 characters for the priority change." } });
        }
        let client;
        try {
            client = await pool.connect();
            await client.query("BEGIN");
            const found = await client.query("SELECT id,status,department_id,priority_level FROM complaints WHERE ticket_id=$1 FOR UPDATE", [ticketId]);
            if (!found.rowCount) throw apiError(404, "TICKET_NOT_FOUND", "No saved complaint was found for that ticket ID.");
            const current = found.rows[0];
            if (!mayAccessDepartment(req.user, current.department_id)) throw apiError(403, "FORBIDDEN", "This complaint belongs to another department.");
            if (!["assigned", "in_progress", "reopened"].includes(current.status)) {
                throw apiError(409, "INVALID_PRIORITY_STATE", "Priority can only be changed while department work is active.");
            }
            const note = `Officer changed priority from ${current.priority_level} to ${priorityLevel}. Reason: ${reason.trim()}`;
            await client.query(
                `UPDATE complaints SET priority_level=$1,priority_reason=$2,priority_source='officer',
                    priority_assessed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$3`,
                [priorityLevel, reason.trim(), current.id]
            );
            await client.query(
                `INSERT INTO complaint_events (complaint_id,event_type,actor_type,actor_user_id,note)
                 VALUES ($1,'priority_updated',$2,$3,$4)`,
                [current.id, req.user.role, req.user.sub, note]
            );
            const complaint = await findComplaint(client, ticketId);
            await client.query("COMMIT");
            delete complaint.ownerId;
            return res.json({ complaint });
        } catch (error) {
            if (client) { try { await client.query("ROLLBACK"); } catch {} }
            return next(error);
        } finally { if (client) client.release(); }
    });

    router.patch("/complaints/:ticketId/status", ...staffOnly, async (req, res, next) => {
        const nextStatus = req.body?.status;
        if (!Object.values(TRANSITIONS).includes(nextStatus)) return res.status(400).json({ error: { code: "INVALID_STATUS", message: "Choose a permitted next status." } });
        if (!/^CIV-[A-F0-9]{16}$/i.test(req.params.ticketId.trim())) return res.status(400).json({ error: { code: "INVALID_TICKET_ID", message: "Invalid ticket ID." } });
        let client;
        try {
            client = await pool.connect(); await client.query("BEGIN");
            const found = await client.query("SELECT id,status,department_id FROM complaints WHERE ticket_id=$1 FOR UPDATE", [req.params.ticketId.trim().toUpperCase()]);
            if (!found.rowCount) throw apiError(404, "TICKET_NOT_FOUND", "No saved complaint was found for that ticket ID.");
            const current = found.rows[0];
            if (!mayAccessDepartment(req.user, current.department_id)) throw apiError(403, "FORBIDDEN", "This complaint belongs to another department.");
            if (TRANSITIONS[current.status] !== nextStatus) throw apiError(409, "INVALID_TRANSITION", `A complaint in ${current.status} cannot move to ${nextStatus}.`);
            if (nextStatus === "resolution_pending_confirmation") {
                const evidence = await client.query("SELECT 1 FROM complaint_media WHERE complaint_id=$1 AND media_kind='resolution' LIMIT 1", [current.id]);
                if (!evidence.rowCount) throw apiError(409, "EVIDENCE_REQUIRED", "Upload at least one resolution evidence image before submitting this work for citizen confirmation.");
            }
            await client.query("UPDATE complaints SET status=$1, closed_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$2", [nextStatus, current.id]);
            await client.query(`INSERT INTO complaint_events (complaint_id,event_type,actor_type,actor_user_id,previous_status,new_status,note)
                VALUES ($1,'status_changed',$2,$3,$4,$5,$6)`, [current.id, req.user.role, req.user.sub, current.status, nextStatus,
                nextStatus === "in_progress" ? "Department officer started or resumed work." : "Work submitted with evidence; awaiting citizen confirmation."]);
            const complaint = await findComplaint(client, req.params.ticketId.trim().toUpperCase());
            await client.query("COMMIT"); delete complaint.ownerId; return res.json({ complaint });
        } catch (error) { if (client) { try { await client.query("ROLLBACK"); } catch {} } return next(error); }
        finally { if (client) client.release(); }
    });
    return router;
}

function createAdminRouter(pool, authenticate) {
    const router = express.Router();
    router.get("/overview", authenticate, requireRoles("administrator"), async (_req, res, next) => {
        try {
            const result = await pool.query(`SELECT
                count(*)::int AS total_complaints,
                count(*) FILTER (WHERE status IN ('assigned','in_progress','resolution_pending_confirmation','reopened'))::int AS open_complaints,
                count(*) FILTER (WHERE status <> 'closed' AND due_at < CURRENT_TIMESTAMP)::int AS overdue_complaints,
                count(*) FILTER (WHERE EXISTS (SELECT 1 FROM complaint_events e WHERE e.complaint_id=complaints.id AND e.event_type='escalated'))::int AS escalated_complaints,
                count(*) FILTER (WHERE status='closed')::int AS closed_complaints,
                count(*) FILTER (WHERE status='closed' AND closed_at <= due_at)::int AS closed_within_sla,
                count(*) FILTER (WHERE status='closed' AND closed_at IS NOT NULL)::int AS closed_with_timestamp,
                count(DISTINCT department_id)::int AS departments,
                (SELECT count(*)::int FROM complaint_events WHERE event_type='citizen_confirmed') AS citizen_confirmed_closures,
                (SELECT count(DISTINCT complaint_id)::int FROM complaint_events WHERE event_type='reopened') AS reopened_complaints,
                avg(EXTRACT(EPOCH FROM (closed_at-created_at))/3600) FILTER (WHERE status='closed' AND closed_at IS NOT NULL) AS avg_resolution_hours
              FROM complaints`);
            const row = result.rows[0], denom = row.closed_with_timestamp;
            return res.json({ overview: {
                totalComplaints: row.total_complaints, openComplaints: row.open_complaints,
                overdueComplaints: row.overdue_complaints, escalatedComplaints: row.escalated_complaints,
                closedComplaints: row.closed_complaints, resolvedWithinSlaPercent: denom ? Number((row.closed_within_sla * 100 / denom).toFixed(1)) : null,
                resolvedWithinSlaDenominator: denom, averageResolutionHours: row.avg_resolution_hours === null ? null : Number(Number(row.avg_resolution_hours).toFixed(2)),
                citizenConfirmedClosures: row.citizen_confirmed_closures, reopenedComplaints: row.reopened_complaints, departments: row.departments,
                slaNote: "Within-SLA percentage includes closed complaints with a recorded closed_at; average resolution time uses closed_at minus created_at."
            }});
        } catch (error) { return next(error); }
    });
    return router;
}

module.exports = { TRANSITIONS, createAdminRouter, createOfficerRouter, mayAccessDepartment };
