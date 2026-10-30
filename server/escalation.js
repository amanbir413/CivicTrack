const ESCALATION_LOCK = 2424941;

async function runEscalationCheck(pool, { now = new Date(), batchSize = 200 } = {}) {
    const runAt = new Date(now);
    if (Number.isNaN(runAt.getTime())) throw new TypeError("now must be a valid date");
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const lock = await client.query("SELECT pg_try_advisory_xact_lock($1, 3) AS acquired", [ESCALATION_LOCK]);
        if (!lock.rows[0].acquired) { await client.query("ROLLBACK"); return { escalated: 0, skipped: true }; }
        const overdue = await client.query(`SELECT c.id,c.ticket_id,c.due_at,c.status
            FROM complaints c
            WHERE c.status <> 'closed' AND c.due_at <= $1
              AND NOT EXISTS (SELECT 1 FROM complaint_events e WHERE e.complaint_id=c.id AND e.event_type='escalated')
            ORDER BY c.due_at,c.id LIMIT $2 FOR UPDATE OF c SKIP LOCKED`, [runAt, batchSize]);
        for (const row of overdue.rows) {
            const dueAt = new Date(row.due_at).toISOString();
            await client.query(`INSERT INTO complaint_events (complaint_id,event_type,actor_type,previous_status,new_status,note,created_at)
                VALUES ($1,'escalated','system',$2,$2,$3,$4)
                ON CONFLICT (complaint_id) WHERE event_type='escalated' DO NOTHING`,
                [row.id, row.status, `SLA deadline ${dueAt} passed; complaint remains ${row.status} pending department action. Escalation check ran at ${runAt.toISOString()}.`, runAt]);
        }
        await client.query("COMMIT");
        return { escalated: overdue.rowCount, skipped: false };
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} throw error; }
    finally { client.release(); }
}

function startEscalationScheduler(pool, intervalMs = Number(process.env.ESCALATION_INTERVAL_MS) || 60_000) {
    let active = false;
    const tick = async () => {
        if (active) return;
        active = true;
        try { const result = await runEscalationCheck(pool); if (result.escalated) console.log(`Recorded ${result.escalated} SLA escalation(s).`); }
        catch (error) { console.error("SLA escalation check failed:", error.message); }
        finally { active = false; }
    };
    void tick();
    const timer = setInterval(tick, Math.max(1000, intervalMs));
    timer.unref?.();
    return () => clearInterval(timer);
}

module.exports = { runEscalationCheck, startEscalationScheduler };
