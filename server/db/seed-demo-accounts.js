const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });
const bcrypt = require("bcryptjs");
const { pool } = require("../db");

async function upsertDemoUser({ email, password, role, departmentSlug = null, name }) {
    if (!email || !password || password.length < 12) {
        throw new Error(`${role} demo account requires an email and a password of at least 12 characters.`);
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const department = departmentSlug
        ? (await pool.query("SELECT id FROM departments WHERE slug = $1", [departmentSlug])).rows[0]
        : null;
    if (departmentSlug && !department) throw new Error(`Unknown department slug: ${departmentSlug}`);
    await pool.query(
        `INSERT INTO users (name, email, password_hash, role, department_id)
         VALUES ($1, lower($2), $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role, department_id = EXCLUDED.department_id`,
        [name, email.trim(), passwordHash, role, department?.id ?? null]
    );
    console.log(`Configured ${role} account: ${email.trim().toLowerCase()}`);
}

async function main() {
    if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEMO_ACCOUNTS !== "true") {
        throw new Error("Demo accounts are disabled. Set ENABLE_DEMO_ACCOUNTS=true in a non-production environment to run this command.");
    }
    const officerEmail = process.env.DEMO_OFFICER_EMAIL;
    const officerPassword = process.env.DEMO_OFFICER_PASSWORD;
    const officerDepartment = process.env.DEMO_OFFICER_DEPARTMENT;
    const citizenEmail = process.env.DEMO_CITIZEN_EMAIL;
    const citizenPassword = process.env.DEMO_CITIZEN_PASSWORD;
    const departmentOfficers = [
        { departmentSlug: "water", name: "Demo Water Officer", email: process.env.DEMO_WATER_OFFICER_EMAIL, password: process.env.DEMO_WATER_OFFICER_PASSWORD },
        { departmentSlug: "power", name: "Demo Power Officer", email: process.env.DEMO_POWER_OFFICER_EMAIL, password: process.env.DEMO_POWER_OFFICER_PASSWORD },
        { departmentSlug: "sanitation", name: "Demo Sanitation Officer", email: process.env.DEMO_SANITATION_OFFICER_EMAIL, password: process.env.DEMO_SANITATION_OFFICER_PASSWORD },
        { departmentSlug: "horticulture", name: "Demo Horticulture Officer", email: process.env.DEMO_HORTICULTURE_OFFICER_EMAIL, password: process.env.DEMO_HORTICULTURE_OFFICER_PASSWORD },
        { departmentSlug: "general", name: "Demo General Services Officer", email: process.env.DEMO_GENERAL_OFFICER_EMAIL, password: process.env.DEMO_GENERAL_OFFICER_PASSWORD }
    ];
    const adminEmail = process.env.DEMO_ADMIN_EMAIL;
    const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
    const configured = [];
    if (citizenEmail || citizenPassword) {
        if (!citizenEmail || !citizenPassword) throw new Error("Set DEMO_CITIZEN_EMAIL and DEMO_CITIZEN_PASSWORD together.");
        configured.push({ name: "Demo Citizen", email: citizenEmail, password: citizenPassword, role: "citizen" });
    }
    if (officerEmail || officerPassword || officerDepartment) {
        if (!officerEmail || !officerPassword || !officerDepartment) throw new Error("Set DEMO_OFFICER_EMAIL, DEMO_OFFICER_PASSWORD, and DEMO_OFFICER_DEPARTMENT together.");
        configured.push({ name: "Demo Department Officer", email: officerEmail, password: officerPassword, role: "officer", departmentSlug: officerDepartment });
    }
    for (const officer of departmentOfficers) {
        if (officer.email || officer.password) {
            if (!officer.email || !officer.password) throw new Error(`Set ${officer.departmentSlug} demo officer email and password together.`);
            configured.push({ ...officer, role: "officer" });
        }
    }
    if (adminEmail || adminPassword) {
        if (!adminEmail || !adminPassword) throw new Error("Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD together.");
        configured.push({ name: "Demo Administrator", email: adminEmail, password: adminPassword, role: "administrator" });
    }
    if (!configured.length) throw new Error("Configure at least one demo account in environment variables before running this command.");
    for (const account of configured) await upsertDemoUser(account);
}

main().catch(error => { console.error("Demo account seeding failed:", error.message); process.exitCode = 1; }).finally(() => pool.end());
