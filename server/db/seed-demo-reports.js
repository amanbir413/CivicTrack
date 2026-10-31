const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });
const { pool } = require("../db");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DEMO_REPORTS = [
    {
        ticketId: "CIV-000000000000D001",
        title: "New pothole report near the university gate",
        description: "A newly submitted road defect report used to demonstrate the normal reporting and assignment flow.",
        category: "roads", status: "assigned", latitude: 30.7694, longitude: 76.5757,
        createdAgo: 20 * 60 * 1000, dueFromNow: 47 * HOUR + 40 * 60 * 1000,
        priority: "high", reason: "Demo scenario: a newly reported road hazard awaiting department review.",
        timeline: []
    },
    {
        ticketId: "CIV-000000000000D002",
        title: "Streetlight outage awaiting department action",
        description: "An escalated active report used to demonstrate the public follow-up video flow after its response deadline.",
        category: "lights", status: "in_progress", latitude: 30.7668, longitude: 76.5821,
        createdAgo: 8 * DAY, dueFromNow: -7 * DAY,
        priority: "high", reason: "Demo scenario: the response deadline passed and an SLA escalation was recorded.",
        timeline: [
            { type: "status_changed", actor: "system", previous: "assigned", next: "in_progress", note: "Demo scenario: department work started.", at: -(7 * DAY + 23 * HOUR) },
            { type: "escalated", actor: "system", previous: "in_progress", next: "in_progress", note: "Demo scenario: the SLA deadline passed; the report remains open for department action.", at: -7 * DAY + 60 * 1000 }
        ]
    },
    {
        ticketId: "CIV-000000000000D003",
        title: "Water leak still awaiting resolution",
        description: "A reopened report that is well beyond its target deadline, demonstrating a long-overdue escalation scenario.",
        category: "water", status: "reopened", latitude: 30.7736, longitude: 76.5698,
        createdAgo: 18 * DAY, dueFromNow: -17 * DAY,
        priority: "critical", reason: "Demo scenario: a persistent water leak remains unresolved well beyond its deadline.",
        timeline: [
            { type: "status_changed", actor: "system", previous: "assigned", next: "in_progress", note: "Demo scenario: department work started.", at: -(18 * DAY - HOUR) },
            { type: "status_changed", actor: "system", previous: "in_progress", next: "resolution_pending_confirmation", note: "Demo scenario: proposed work was submitted for citizen review.", at: -(18 * DAY - 6 * HOUR) },
            { type: "reopened", actor: "system", previous: "resolution_pending_confirmation", next: "reopened", note: "Demo scenario: the issue remained unresolved and work was reopened.", at: -17 * DAY },
            { type: "escalated", actor: "system", previous: "reopened", next: "reopened", note: "Demo scenario: the SLA deadline passed; the report remains reopened for department action.", at: -17 * DAY + 60 * 1000 }
        ]
    }
];

async function main() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const citizenEmail = (process.env.DEMO_CITIZEN_EMAIL || "testcitizen@gmail.com").trim().toLowerCase();
        const citizen = await client.query("SELECT id FROM users WHERE email=$1 AND role='citizen'", [citizenEmail]);
        const userId = citizen.rows[0]?.id ?? null;
        const seededAt = Date.now();

        for (const demo of DEMO_REPORTS) {
            const category = await client.query(`SELECT id,department_id FROM issue_categories WHERE slug=$1`, [demo.category]);
            if (!category.rowCount) throw new Error(`Missing issue category: ${demo.category}`);
            const createdAt = new Date(seededAt - demo.createdAgo);
            const updatedAt = demo.timeline.length ? new Date(seededAt + demo.timeline[demo.timeline.length - 1].at) : createdAt;
            const dueAt = new Date(seededAt + demo.dueFromNow);
            const inserted = await client.query(`INSERT INTO complaints
                    (ticket_id,title,description,category_id,department_id,user_id,status,latitude,longitude,
                     due_at,created_at,updated_at,priority_level,priority_reason,priority_source,priority_assessed_at,is_demo)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'rules',$11,TRUE)
                ON CONFLICT (ticket_id) DO NOTHING
                RETURNING id`, [demo.ticketId,demo.title,demo.description,category.rows[0].id,category.rows[0].department_id,
                userId,demo.status,demo.latitude,demo.longitude,dueAt,createdAt,updatedAt,demo.priority,demo.reason]);
            const complaint = inserted.rows[0] || (await client.query("SELECT id FROM complaints WHERE ticket_id=$1", [demo.ticketId])).rows[0];
            if (!complaint) throw new Error(`Could not find seeded report ${demo.ticketId}`);

            const submitted = await client.query(`SELECT 1 FROM complaint_events WHERE complaint_id=$1 AND event_type='submitted'`, [complaint.id]);
            if (!submitted.rowCount) await client.query(`INSERT INTO complaint_events
                    (complaint_id,event_type,actor_type,actor_user_id,new_status,note,created_at)
                VALUES ($1,'submitted','citizen',$2,'assigned',$3,$4)`,
            [complaint.id,userId,"Demo report submitted and assigned to its responsible department.",createdAt]);

            for (const event of demo.timeline) {
                const eventAt = new Date(seededAt + event.at);
                const exists = await client.query(`SELECT 1 FROM complaint_events
                    WHERE complaint_id=$1 AND event_type=$2 AND previous_status IS NOT DISTINCT FROM $3
                        AND new_status IS NOT DISTINCT FROM $4`, [complaint.id,event.type,event.previous,event.next]);
                if (exists.rowCount) continue;
                await client.query(`INSERT INTO complaint_events
                        (complaint_id,event_type,actor_type,previous_status,new_status,note,created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
                [complaint.id,event.type,event.actor,event.previous,event.next,event.note,eventAt]);
            }
        }

        await client.query("COMMIT");
        console.log(`Ensured ${DEMO_REPORTS.length} local demo reports are present.`);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

main().catch(error => { console.error("Demo report seeding failed:", error.message); process.exitCode = 1; }).finally(() => pool.end());
