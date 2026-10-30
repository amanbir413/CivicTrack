const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const databaseUrl = process.env.TEST_DATABASE_URL;
const secret = "phase-two-integration-test-secret-which-is-over-32-bytes";
process.env.JWT_SECRET ||= secret;
if (databaseUrl) process.env.DATABASE_URL ||= databaseUrl;

test("Phase 2-4 authentication, privacy, geographic reports, evidence, escalation, citizen decisions and metrics", { skip: !databaseUrl && "Set TEST_DATABASE_URL to an isolated PostgreSQL test database." }, async () => {
    const schema = `phase4_${randomUUID().replaceAll("-", "")}`;
    const uploadRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "civic-phase4-"));
    const bootstrap = new Pool({ connectionString: databaseUrl });
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    let server;
    try {
        for (const file of ["001_initial.sql", "002_auth_and_department_workflow.sql", "003_accountability.sql", "004_geographic_lookup.sql", "005_report_photos.sql"]) {
            await pool.query(fs.readFileSync(path.join(__dirname, "db", "migrations", file), "utf8"));
        }
        const { createApp } = require("./server");
        const { LocalStorage } = require("./storage/local");
        const { runEscalationCheck } = require("./escalation");
        const app = createApp(pool, secret, { storage: new LocalStorage(uploadRoot) });
        server = app.listen(0, "127.0.0.1");
        await new Promise(resolve => server.once("listening", resolve));
        const base = `http://127.0.0.1:${server.address().port}`;

        async function call(url, { method = "GET", body, cookie, headers: extraHeaders = {}, raw = false } = {}) {
            const headers = { ...extraHeaders };
            if (body !== undefined && !raw && !(body instanceof FormData)) headers["content-type"] = "application/json";
            if (cookie) headers.cookie = cookie;
            const response = await fetch(base + url, { method, headers, body: body === undefined ? undefined : (raw || body instanceof FormData ? body : JSON.stringify(body)) });
            const payload = response.status === 204 ? null : response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.arrayBuffer();
            const setCookie = response.headers.getSetCookie?.()[0];
            const session = setCookie?.split(";")[0];
            return { response, payload, session };
        }

        const citizenSignup = await call("/api/auth/register", { method: "POST", body: {
            name: "Citizen One", email: "Citizen.One@example.test", password: "Civic-Phase2-Password-1", role: "administrator", departmentId: 1
        } });
        assert.equal(citizenSignup.response.status, 201);
        assert.equal(citizenSignup.payload.user.role, "citizen", "public registration must ignore submitted role");
        assert.ok(citizenSignup.session?.startsWith("civic_session="), "login session is an HttpOnly cookie");
        const citizenCookie = citizenSignup.session;
        const hashRow = await pool.query("SELECT password_hash FROM users WHERE email = $1", ["citizen.one@example.test"]);
        assert.notEqual(hashRow.rows[0].password_hash, "Civic-Phase2-Password-1");
        assert.equal(await bcrypt.compare("Civic-Phase2-Password-1", hashRow.rows[0].password_hash), true);
        const storedCitizen = await pool.query("SELECT role, department_id FROM users WHERE email = $1", ["citizen.one@example.test"]);
        assert.deepEqual(storedCitizen.rows[0], { role: "citizen", department_id: null });

        const duplicate = await call("/api/auth/register", { method: "POST", body: { name: "Again", email: "citizen.one@example.test", password: "Civic-Phase2-Password-1" } });
        assert.equal(duplicate.response.status, 409);
        const invalidLogin = await call("/api/auth/login", { method: "POST", body: { email: "citizen.one@example.test", password: "wrong-password" } });
        assert.equal(invalidLogin.response.status, 401);
        const profile = await call("/api/auth/me", { cookie: citizenCookie });
        assert.equal(profile.payload.user.role, "citizen");
        const validCitizenLogin = await call("/api/auth/login", { method: "POST", body: { email: "citizen.one@example.test", password: "Civic-Phase2-Password-1" } });
        assert.equal(validCitizenLogin.response.status, 200);
        assert.equal(validCitizenLogin.payload.user.role, "citizen");

        for (const endpoint of ["/api/officer/queue", "/api/admin/overview"]) {
            const denied = await call(endpoint, { cookie: citizenCookie });
            assert.equal(denied.response.status, 403, `${endpoint} must reject citizens`);
        }
        const noSession = await call("/api/officer/queue");
        assert.equal(noSession.response.status, 401);
        const anonymousCreate = await call("/api/complaints", { method: "POST", body: { category: "roads", title: "Anonymous test" } });
        assert.equal(anonymousCreate.response.status, 401);

        const createdRoads = await call("/api/complaints", { method: "POST", cookie: citizenCookie, body: {
            title: "Test road repair", description: "Private full description for integration test.", category: "roads",
            location: { latitude: 22.57, longitude: 88.36, mapX: 120, mapY: 80 }
        } });
        assert.equal(createdRoads.response.status, 201);
        const roadTicket = createdRoads.payload.complaint.ticketId;
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
        const reportPhotoForm = new FormData(); reportPhotoForm.append("file", new Blob([png], { type: "image/png" }), "report.png");
        const reportPhoto = await call(`/api/complaints/${roadTicket}/photo`, { method: "POST", cookie: citizenCookie, body: reportPhotoForm });
        assert.equal(reportPhoto.response.status, 201);
        assert.equal(reportPhoto.payload.photo.kind, "report");
        const storedReportPhoto = await pool.query("SELECT uploader_user_id,mime_type,byte_size,media_kind FROM complaint_media WHERE id=$1", [reportPhoto.payload.photo.id]);
        const storedReportOwner = await pool.query("SELECT id FROM users WHERE email=$1", ["citizen.one@example.test"]);
        assert.equal(String(storedReportPhoto.rows[0].uploader_user_id), String(storedReportOwner.rows[0].id));
        assert.deepEqual({ mime_type: storedReportPhoto.rows[0].mime_type, byte_size: storedReportPhoto.rows[0].byte_size, media_kind: storedReportPhoto.rows[0].media_kind }, { mime_type: "image/png", byte_size: png.length, media_kind: "report" });
        assert.equal((await call(`/api/complaints/${roadTicket}/photo`, { method: "POST", body: reportPhotoForm })).response.status, 401);
        const createdWater = await call("/api/complaints", { method: "POST", cookie: citizenCookie, body: {
            title: "Test water leak", description: "Water details for a different department.", category: "water"
        } });
        assert.equal(createdWater.response.status, 201);
        const waterTicket = createdWater.payload.complaint.ticketId;
        const createdClosed = await call("/api/complaints", { method: "POST", cookie: citizenCookie, body: { title: "Already closed report", description: "Closed before escalation check.", category: "other" } });
        assert.equal(createdClosed.response.status, 201);
        const closedTicket = createdClosed.payload.complaint.ticketId;

        const nearby = await call("/api/complaints/suggestions", { method: "POST", cookie: citizenCookie, body: {
            category: "roads", location: { latitude: 22.5705, longitude: 88.3605 }
        } });
        assert.equal(nearby.response.status, 200);
        assert.equal(nearby.payload.suggestions[0].ticketId, roadTicket);
        assert.ok(nearby.payload.suggestions[0].distanceMeters < 100);
        assert.equal(nearby.payload.suggestions[0].category.slug, "roads");
        assert.equal(nearby.payload.suggestions[0].title, undefined, "suggestions expose no complaint title or description");
        const wrongCategory = await call("/api/complaints/suggestions", { method: "POST", cookie: citizenCookie, body: {
            category: "water", location: { latitude: 22.57, longitude: 88.36 }
        } });
        assert.equal(wrongCategory.payload.suggestions.length, 0, "nearby reports in another category are not suggested");
        const tooFar = await call("/api/complaints/suggestions", { method: "POST", cookie: citizenCookie, body: {
            category: "roads", location: { latitude: 22.60, longitude: 88.39 }
        } });
        assert.equal(tooFar.payload.suggestions.length, 0, "reports outside configured radius are not suggested");
        assert.equal((await call("/api/complaints/suggestions", { method: "POST", body: { category: "roads", location: { latitude: 22.57, longitude: 88.36 } } })).response.status, 401);
        const mapReports = await call("/api/complaints/map");
        assert.equal(mapReports.response.status, 200);
        const mappedRoad = mapReports.payload.reports.find(report => report.ticketId === roadTicket);
        assert.ok(mappedRoad, "persisted, geolocated report appears on public map");
        assert.equal(mappedRoad.latitude, 22.57);
        assert.equal(mappedRoad.longitude, 88.36);
        assert.equal(mappedRoad.title, undefined);
        assert.equal(mappedRoad.description, undefined);
        assert.equal(mappedRoad.userId, undefined);
        assert.equal(mapReports.payload.reports.some(report => report.ticketId === waterTicket), false, "reports without coordinates do not appear on map");
        const categoryMap = await call("/api/complaints/map?category=roads");
        assert.ok(categoryMap.payload.reports.length > 0);
        assert.ok(categoryMap.payload.reports.every(report => report.category.slug === "roads"), "map category filter returns only that category");
        assert.equal((await call("/api/complaints/map?category=water")).payload.reports.length, 0);
        assert.equal((await call("/api/complaints/map?status=closed")).payload.reports.length, 0, "status filter matches persisted workflow status");

        const publicTicket = await call(`/api/complaints/${roadTicket}`);
        assert.equal(publicTicket.response.status, 200);
        assert.equal(publicTicket.payload.complaint.description, undefined);
        assert.equal(publicTicket.payload.complaint.location, undefined);
        assert.equal(publicTicket.payload.complaint.evidence, undefined, "report photos are not exposed publicly");
        assert.equal(publicTicket.payload.complaint.events[0].note, undefined);
        const privateTicket = await call(`/api/complaints/${roadTicket}`, { cookie: citizenCookie });
        assert.equal(privateTicket.payload.complaint.description, "Private full description for integration test.");
        assert.equal(privateTicket.payload.complaint.location.latitude, 22.57);
        assert.equal(privateTicket.payload.complaint.evidence[0].kind, "report");
        const ownReports = await call("/api/complaints/mine", { cookie: citizenCookie });
        assert.equal(ownReports.payload.complaints.length, 3);

        const roadsDepartment = (await pool.query("SELECT id FROM departments WHERE slug = 'roads'")).rows[0].id;
        const waterDepartment = (await pool.query("SELECT id FROM departments WHERE slug = 'water'")).rows[0].id;
        await assert.rejects(
            pool.query("UPDATE complaints SET department_id = $1 WHERE ticket_id = $2", [roadsDepartment, waterTicket]),
            error => error.code === "23503"
        );
        const officerHash = await bcrypt.hash("Officer-Phase2-Password-1", 4);
        const officer = await pool.query(
            "INSERT INTO users (name,email,password_hash,role,department_id) VALUES ('Road Officer','officer@example.test',$1,'officer',$2) RETURNING id",
            [officerHash, roadsDepartment]
        );
        const unrelatedOfficerHash = await bcrypt.hash("Water-Phase2-Password-1", 4);
        await pool.query("INSERT INTO users (name,email,password_hash,role,department_id) VALUES ('Water Officer','water@example.test',$1,'officer',$2)", [unrelatedOfficerHash, waterDepartment]);

        const officerLogin = await call("/api/auth/login", { method: "POST", body: { email: "officer@example.test", password: "Officer-Phase2-Password-1" } });
        assert.equal(officerLogin.response.status, 200);
        const officerCookie = officerLogin.session;
        const officerAdminDenied = await call("/api/admin/overview", { cookie: officerCookie });
        assert.equal(officerAdminDenied.response.status, 403);
        const queue = await call("/api/officer/queue", { cookie: officerCookie });
        assert.equal(queue.response.status, 200);
        assert.ok(queue.payload.queue.some(complaint => complaint.ticketId === roadTicket));
        assert.ok(!queue.payload.queue.some(complaint => complaint.ticketId === waterTicket));
        const unrelatedDetail = await call(`/api/officer/complaints/${waterTicket}`, { cookie: officerCookie });
        assert.equal(unrelatedDetail.response.status, 403);
        const unrelatedUpdate = await call(`/api/officer/complaints/${waterTicket}/status`, { method: "PATCH", cookie: officerCookie, body: { status: "in_progress" } });
        assert.equal(unrelatedUpdate.response.status, 403);
        const invalidTransition = await call(`/api/officer/complaints/${roadTicket}/status`, { method: "PATCH", cookie: officerCookie, body: { status: "resolution_pending_confirmation" } });
        assert.equal(invalidTransition.response.status, 409);
        const arbitraryStatus = await call(`/api/officer/complaints/${roadTicket}/status`, { method: "PATCH", cookie: officerCookie, body: { status: "closed" } });
        assert.equal(arbitraryStatus.response.status, 400);

        const started = await call(`/api/officer/complaints/${roadTicket}/status`, { method: "PATCH", cookie: officerCookie, body: { status: "in_progress" } });
        assert.equal(started.response.status, 200);
        assert.equal(started.payload.complaint.status, "in_progress");
        const auditEvent = await pool.query(
            "SELECT actor_type, actor_user_id, previous_status, new_status FROM complaint_events WHERE complaint_id = (SELECT id FROM complaints WHERE ticket_id = $1) ORDER BY id DESC LIMIT 1", [roadTicket]
        );
        assert.deepEqual(auditEvent.rows[0], { actor_type: "officer", actor_user_id: String(officer.rows[0].id), previous_status: "assigned", new_status: "in_progress" });
        const evidenceRequired = await call(`/api/officer/complaints/${roadTicket}/status`, { method: "PATCH", cookie: officerCookie, body: { status: "resolution_pending_confirmation" } });
        assert.equal(evidenceRequired.response.status, 409);
        assert.equal(evidenceRequired.payload.error.code, "EVIDENCE_REQUIRED");

        const secondSignup = await call("/api/auth/register", { method: "POST", body: { name: "Other Citizen", email: "other.citizen@example.test", password: "Civic-Phase3-Password-2" } });
        assert.equal(secondSignup.response.status, 201);
        const wrongOwnerReportPhoto = await call(`/api/complaints/${roadTicket}/photo`, { method: "POST", cookie: secondSignup.session, body: reportPhotoForm });
        assert.equal(wrongOwnerReportPhoto.response.status, 403);
        const ownerReportPhoto = await call("/api/evidence/" + reportPhoto.payload.photo.id, { cookie: citizenCookie });
        assert.equal(ownerReportPhoto.response.status, 200);
        assert.equal(Buffer.from(ownerReportPhoto.payload).toString(), png.toString());
        const otherReportPhoto = await call("/api/evidence/" + reportPhoto.payload.photo.id, { cookie: secondSignup.session });
        assert.equal(otherReportPhoto.response.status, 403);
const validForm = new FormData(); validForm.append("file", new Blob([png], { type: "image/png" }), "repair.png");
        const uploaded = await call(`/api/officer/complaints/${roadTicket}/evidence`, { method: "POST", cookie: officerCookie, body: validForm });
        assert.equal(uploaded.response.status, 201);
        const mediaId = uploaded.payload.evidence.id;
        const storedMedia = await pool.query("SELECT uploader_user_id,mime_type,byte_size FROM complaint_media WHERE id=$1", [mediaId]);
        assert.equal(String(storedMedia.rows[0].uploader_user_id), String(officer.rows[0].id));
        assert.equal(storedMedia.rows[0].mime_type, "image/png");
        const privateEvidence = await call(`/api/evidence/${mediaId}`, { cookie: citizenCookie });
        assert.equal(privateEvidence.response.status, 200, "complaint owner can read private evidence");
        assert.equal(Buffer.from(privateEvidence.payload).toString(), png.toString());
        const otherEvidence = await call(`/api/evidence/${mediaId}`, { cookie: secondSignup.session });
        assert.equal(otherEvidence.response.status, 403);
        const anonymousEvidence = await call(`/api/evidence/${mediaId}`);
        assert.equal(anonymousEvidence.response.status, 401);
        const badForm = new FormData(); badForm.append("file", new Blob(["<svg></svg>"], { type: "image/svg+xml" }), "bad.svg");
        const unsupported = await call(`/api/officer/complaints/${roadTicket}/evidence`, { method: "POST", cookie: officerCookie, body: badForm });
        assert.equal(unsupported.response.status, 415);
        const tooLarge = new FormData(); tooLarge.append("file", new Blob([Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)])], { type: "image/png" }), "large.png");
        const oversized = await call(`/api/officer/complaints/${roadTicket}/evidence`, { method: "POST", cookie: officerCookie, body: tooLarge });
        assert.equal(oversized.response.status, 413);
        const unrelatedUpload = await call(`/api/officer/complaints/${roadTicket}/evidence`, { method: "POST", cookie: (await call("/api/auth/login", { method: "POST", body: { email: "water@example.test", password: "Water-Phase2-Password-1" } })).session, body: validForm });
        assert.equal(unrelatedUpload.response.status, 403);

        const completed = await call(`/api/officer/complaints/${roadTicket}/status`, { method: "PATCH", cookie: officerCookie, body: { status: "resolution_pending_confirmation" } });
        assert.equal(completed.response.status, 200);
        const officerConfirmation = await call(`/api/complaints/${roadTicket}/confirmation`, { method: "POST", cookie: officerCookie, body: { decision: "confirm" } });
        assert.equal(officerConfirmation.response.status, 403);
        const wrongOwnerConfirmation = await call(`/api/complaints/${roadTicket}/confirmation`, { method: "POST", cookie: secondSignup.session, body: { decision: "confirm" } });
        assert.equal(wrongOwnerConfirmation.response.status, 403);
        const ownerTracking = await call(`/api/complaints/${roadTicket}`, { cookie: citizenCookie });
        assert.equal(ownerTracking.payload.complaint.viewerIsOwner, true);
        assert.equal(ownerTracking.payload.complaint.evidence.length, 2);
        assert.deepEqual(ownerTracking.payload.complaint.evidence.map(item => item.kind).sort(), ["report", "resolution"]);
        const confirmation = await call(`/api/complaints/${roadTicket}/confirmation`, { method: "POST", cookie: citizenCookie, body: { decision: "confirm" } });
        assert.equal(confirmation.response.status, 200);
        assert.equal(confirmation.payload.complaint.status, "closed");
        assert.ok(confirmation.payload.complaint.closedAt);
        const confirmedEvent = await pool.query("SELECT actor_type,previous_status,new_status FROM complaint_events WHERE complaint_id=(SELECT id FROM complaints WHERE ticket_id=$1) AND event_type='citizen_confirmed'", [roadTicket]);
        assert.deepEqual(confirmedEvent.rows[0], { actor_type: "citizen", previous_status: "resolution_pending_confirmation", new_status: "closed" });
        const duplicateConfirmation = await call(`/api/complaints/${roadTicket}/confirmation`, { method: "POST", cookie: citizenCookie, body: { decision: "confirm" } });
        assert.equal(duplicateConfirmation.response.status, 409);
        const closedSuggestion = await call("/api/complaints/suggestions", { method: "POST", cookie: citizenCookie, body: {
            category: "roads", location: { latitude: 22.57, longitude: 88.36 }
        } });
        assert.equal(closedSuggestion.payload.suggestions.length, 0, "closed reports are not offered as duplicate candidates");

        const waterStart = await call(`/api/officer/complaints/${waterTicket}/status`, { method: "PATCH", cookie: (await call("/api/auth/login", { method: "POST", body: { email: "water@example.test", password: "Water-Phase2-Password-1" } })).session, body: { status: "in_progress" } });
        assert.equal(waterStart.response.status, 200);
        const waterCookie = (await call("/api/auth/login", { method: "POST", body: { email: "water@example.test", password: "Water-Phase2-Password-1" } })).session;
        const waterForm = new FormData(); waterForm.append("file", new Blob([png], { type: "image/png" }), "water.png");
        assert.equal((await call(`/api/officer/complaints/${waterTicket}/evidence`, { method: "POST", cookie: waterCookie, body: waterForm })).response.status, 201);
        assert.equal((await call(`/api/officer/complaints/${waterTicket}/status`, { method: "PATCH", cookie: waterCookie, body: { status: "resolution_pending_confirmation" } })).response.status, 200);
        const rejected = await call(`/api/complaints/${waterTicket}/confirmation`, { method: "POST", cookie: citizenCookie, body: { decision: "reject", note: "Leak remains." } });
        assert.equal(rejected.response.status, 200);
        assert.equal(rejected.payload.complaint.status, "reopened");
        const reopenedEvent = await pool.query("SELECT actor_type,previous_status,new_status,note FROM complaint_events WHERE complaint_id=(SELECT id FROM complaints WHERE ticket_id=$1) AND event_type='reopened'", [waterTicket]);
        assert.deepEqual(reopenedEvent.rows[0], { actor_type: "citizen", previous_status: "resolution_pending_confirmation", new_status: "reopened", note: "Leak remains." });
        assert.equal((await call(`/api/officer/complaints/${waterTicket}/status`, { method: "PATCH", cookie: waterCookie, body: { status: "in_progress" } })).response.status, 200);

        await pool.query("UPDATE complaints SET due_at=CURRENT_TIMESTAMP-INTERVAL '1 hour' WHERE ticket_id IN ($1,$2)", [roadTicket, waterTicket]);
        await pool.query("UPDATE complaints SET status='closed',closed_at=CURRENT_TIMESTAMP,due_at=CURRENT_TIMESTAMP+INTERVAL '1 hour',updated_at=CURRENT_TIMESTAMP WHERE ticket_id=$1", [closedTicket]);
        const firstEscalationCheck = await runEscalationCheck(pool, { now: new Date() });
        assert.equal(firstEscalationCheck.escalated, 1);
        const repeatedEscalationCheck = await runEscalationCheck(pool, { now: new Date() });
        assert.equal(repeatedEscalationCheck.escalated, 0);
        const escalationEvent = await pool.query("SELECT event_type,previous_status,new_status,note FROM complaint_events WHERE complaint_id=(SELECT id FROM complaints WHERE ticket_id=$1) AND event_type='escalated'", [waterTicket]);
        assert.equal(escalationEvent.rowCount, 1);
        assert.match(escalationEvent.rows[0].note, /deadline .* passed; complaint remains in_progress/);
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM complaint_events WHERE complaint_id=(SELECT id FROM complaints WHERE ticket_id=$1) AND event_type='escalated'", [closedTicket])).rows[0].n, 0, "closed complaints are not escalated");

        const adminHash = await bcrypt.hash("Admin-Phase2-Password-1", 4);
        await pool.query("INSERT INTO users (name,email,password_hash,role) VALUES ('Platform Admin','admin@example.test',$1,'administrator')", [adminHash]);
        const adminLogin = await call("/api/auth/login", { method: "POST", body: { email: "admin@example.test", password: "Admin-Phase2-Password-1" } });
        assert.equal(adminLogin.response.status, 200);
        const overview = await call("/api/admin/overview", { cookie: adminLogin.session });
        assert.equal(overview.response.status, 200);
        assert.deepEqual({ total: overview.payload.overview.totalComplaints, open: overview.payload.overview.openComplaints,
            overdue: overview.payload.overview.overdueComplaints, escalated: overview.payload.overview.escalatedComplaints,
            closed: overview.payload.overview.closedComplaints, confirmed: overview.payload.overview.citizenConfirmedClosures,
            reopened: overview.payload.overview.reopenedComplaints, withinSla: overview.payload.overview.resolvedWithinSlaPercent },
            { total: 3, open: 1, overdue: 1, escalated: 1, closed: 2, confirmed: 1, reopened: 1, withinSla: 50 });
        assert.ok(overview.payload.overview.averageResolutionHours >= 0);
        const allQueue = await call("/api/officer/queue", { cookie: adminLogin.session });
        assert.equal(allQueue.payload.queue.length, 3, "administrator sees complaints across departments");
        const adminWater = await call(`/api/officer/complaints/${waterTicket}`, { cookie: adminLogin.session });
        assert.equal(adminWater.response.status, 200);
        for (let i = 0; i < 3; i++) {
            const limitedAttempt = await call("/api/auth/login", { method: "POST", body: { email: "missing@example.test", password: "wrong-password" } });
            assert.equal(limitedAttempt.response.status, 401);
        }
        const rateLimited = await call("/api/auth/login", { method: "POST", body: { email: "missing@example.test", password: "wrong-password" } });
        assert.equal(rateLimited.response.status, 429);

        const logout = await call("/api/auth/logout", { method: "POST", cookie: citizenCookie });
        assert.equal(logout.response.status, 204);
        const afterLogout = await call("/api/auth/me", { cookie: logout.session || "" });
        assert.equal(afterLogout.response.status, 401);
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        await pool.end();
        await bootstrap.query(`DROP SCHEMA "${schema}" CASCADE`);
        await bootstrap.end();
        await fs.promises.rm(uploadRoot, { recursive: true, force: true });
    }
});
