# Civic Issue Escalation & Accountability Platform

LogicLoops' Zinnovation 4.0 civic-tech MVP. The platform includes authenticated citizen accounts, department-scoped officer access, evidence-backed resolution review, recorded SLA escalation, a real Leaflet/OpenStreetMap issue map, nearby duplicate suggestions, and database-derived accountability metrics. The plain HTML, CSS, and JavaScript frontend is preserved.

## What works in this milestone

- The Express server serves the existing frontend and the API from the same origin.
- `POST /api/complaints` validates a report, assigns a department by category, calculates a demonstration SLA, stores the complaint and its initial event in one PostgreSQL transaction, and returns a ticket ID.
- `GET /api/complaints/:ticketId` returns private details to the owner or authorized staff and a limited summary to other visitors.
- `GET /api/health` checks the PostgreSQL connection.
- The existing report wizard submits to the API for signed-in citizens; the tracking page retrieves saved tickets from PostgreSQL.
- Officer queue and status controls are connected to the database and protected by role and department checks.
- Sample issues and dashboard statistics from the original frontend are marked as illustrative browser-only demo data. They do not include new database reports.

## Phase 2 and Phase 3 capabilities

- Citizen registration always creates a citizen role. Passwords are stored as bcrypt hashes. Sign-in returns a signed JWT in an HttpOnly, SameSite=Lax cookie with an eight-hour lifetime; logout clears it.
- Citizens submit reports when signed in, see their own saved report list, and get private details for their own tickets. Public ticket lookup returns a limited summary without description, coordinates, owner identifiers, or event notes.
- Officer sessions can read only their assigned department's work queue and complaint details. Status changes are limited to `assigned → in_progress → resolution_pending_confirmation`; rejection returns the report to `reopened`, from which an officer can resume work. Each change and audit event are written in one transaction.
- Officers must attach at least one image as resolution evidence before submitting work for citizen confirmation. Citizens can confirm or reject only their own pending report; confirmation closes it and records `closed_at`.
- SLA checks run on server startup and at `ESCALATION_INTERVAL_MS` (default one minute). A PostgreSQL advisory transaction lock prevents concurrent schedulers from duplicating work, and a unique event index makes repeated checks idempotent. Escalation adds a history event and does not overwrite workflow status.
- Admin overview metrics are calculated from PostgreSQL. Within-SLA rate uses closed complaints with a recorded `closed_at`; average resolution time is `closed_at - created_at`. Empty averages/rates are returned as `null`.
- Citizens can pin a real location on the report map. The public map shows eligible saved complaints with rounded coordinates and safe ticket fields only; category, workflow status, overdue, and escalation filters are available.
- Before submission, signed-in citizens can see recent open reports in the same category within the configured distance. Suggestions link to public ticket details and never merge reports.
- Local private evidence storage remains the default. An S3-compatible adapter signs private PUT/GET/DELETE requests, and evidence still passes through the existing complaint permission checks and server endpoint.
- Registration is limited to 5 requests and login to 10 requests per IP in 15 minutes (in-memory per process).
- No public endpoint assigns an officer or administrator role.
- Demo officer/admin accounts are created only by the explicit local seed command and require user-configured environment values.

Public map markers are rounded to three decimal places (roughly 100 m) to reduce exposure of a citizen's precise location. Reports without GPS coordinates remain available to authorized owners/staff and ticket lookup, but do not appear on the geographic map or duplicate search.

## Requirements

- Node.js 20 or newer and npm.
- PostgreSQL 16 or newer. Docker Compose is the easiest local setup; a separately installed PostgreSQL server also works.

PostGIS is not required. A bounded latitude/longitude candidate query and Haversine distance calculation run against indexed PostgreSQL columns.

## Run locally with Docker Compose

From the repository root in PowerShell:

```powershell
docker compose up -d --build
```

No `.env` file is required for the local demo. Compose supplies local-only database and signing-key defaults, runs migrations, and creates the two demo accounts at startup. The complete stack (app and database) is available at [http://localhost:3000](http://localhost:3000), with health status at [http://localhost:3000/api/health](http://localhost:3000/api/health). For live source edits, instead run `npm install`, `docker compose up -d db`, `npm run db:migrate`, and `npm run dev`.

Demo sign-in details (these are public demonstration credentials):

| Account | Email | Password |
| --- | --- | --- |
| Citizen | `testcitizen@gmail.com` | `citizen12345` |
| Department officer (Roads) | `testdepartment@gmail.com` | `department12345` |

Anyone with the public repository can see these credentials. They are only for isolated local demo databases. Do not deploy these accounts, the default database password, or the demo JWT signing key to a public service.

Compose stores PostgreSQL data in `civic_postgres_data` and local private uploads in `civic_private_uploads`. The app applies migrations, seeds the local demo accounts, and then starts. PostgreSQL health is checked before the app starts. The default database password is public and intended only for a local demo bound to `127.0.0.1`; on an existing database, changing only `POSTGRES_PASSWORD` does not rotate the password stored in PostgreSQL.

To stop the stack while keeping its data:

```powershell
docker compose down
```

To start it again:

```powershell
docker compose up -d --build
```

Both named volumes survive `docker compose down`. `docker compose down -v` permanently removes the local database and upload data. Back up both volumes before moving a deployment.

## Use an existing PostgreSQL server

Copy `.env.example` to `.env`, set `DATABASE_URL` to the local PostgreSQL connection string, then run:

```powershell
npm install
npm run db:migrate
npm run dev
```

The migration creates the department/category mapping, demo SLA rules, complaints, complaint event history, and indexes. It records the applied migration and can be run again safely.
Migration `002_auth_and_department_workflow.sql` adds user accounts, report ownership, event actor references, role/department constraints, and a category/department consistency constraint. It preserves complaint rows already in the database.

Migration `003_accountability.sql` adds `closed_at`, private complaint media metadata, an overdue index, and a uniqueness guard for escalation events. It preserves existing reports and backfills `closed_at` for records already marked closed.

Migration `004_geographic_lookup.sql` adds the partial index used for recent, geolocated, non-closed nearby searches. The Compose app runs all unapplied migrations automatically at startup.

The checked-in `.env.example` and Compose defaults contain a deliberately public demo JWT key. For any hosted or production deployment, replace it with a unique random secret of at least 32 bytes, set `NODE_ENV=production`, and set `ENABLE_DEMO_ACCOUNTS=false`. The server rejects the demo signing key in production. Keep production secrets in the hosting provider's secret settings, never in GitHub source files.

For the Docker demo, the two accounts above are seeded automatically after migrations. To provision different local accounts manually, set `ENABLE_DEMO_ACCOUNTS=true`, `DEMO_OFFICER_EMAIL`, `DEMO_OFFICER_PASSWORD`, and `DEMO_OFFICER_DEPARTMENT` (for example `roads`) in `.env`. Optionally set `DEMO_ADMIN_EMAIL` and `DEMO_ADMIN_PASSWORD`. Use passwords of at least 12 characters, then run:

```powershell
npm run db:seed-demo-accounts
```

The command refuses to run in production and hashes passwords before storing them. The default public demo credentials are convenient for local presentations; use different credentials for any shared hosted environment.

## API contract

Authentication is cookie-based; same-origin browser requests use the session automatically. Do not put JWTs in browser local storage.

- `POST /api/auth/register` accepts `{ "name", "email", "password" }` and creates a citizen. Any submitted `role` or `department_id` is ignored.
- `POST /api/auth/login` accepts `{ "email", "password" }`; `POST /api/auth/logout` clears the session cookie.
- `GET /api/auth/me` returns the signed-in account profile and role.
- `POST /api/complaints` requires a citizen session and saves the account as report owner.
- `GET /api/complaints/mine` returns that citizen's private reports.
- `GET /api/complaints/:ticketId` remains available for ticket tracking. Owners, assigned department staff, and admins receive details permitted by their role; other visitors get the limited public summary.
- `GET /api/officer/queue` and `GET /api/officer/counts` require an officer or administrator session. Officers are automatically scoped to their assigned department. Administrators can see all departments; `?departmentId=` narrows an administrator query.
- `GET /api/officer/complaints/:ticketId` returns processing details only to the assigned department or an administrator.
- `PATCH /api/officer/complaints/:ticketId/status` accepts `{ "status": "in_progress" }` or `{ "status": "resolution_pending_confirmation" }` when the transition is valid.
- `POST /api/officer/complaints/:ticketId/evidence` accepts a multipart `file` field with JPEG, PNG, or WebP up to 5 MB. Evidence must be uploaded while work is in progress.
- `GET /api/evidence/:mediaId` serves evidence only to its complaint owner, an officer in the complaint department, or an administrator.
- `POST /api/complaints/:ticketId/confirmation` accepts `{ "decision": "confirm" }` or `{ "decision": "reject", "note": "..." }` from the owning citizen while status is `resolution_pending_confirmation`.
- `PATCH /api/officer/complaints/:ticketId/status` also accepts `{ "status": "in_progress" }` from `reopened` complaints.
- `GET /api/admin/overview` returns database-backed accountability metrics and requires an administrator session.
- `GET /api/health` checks the PostgreSQL connection.
- `GET /api/complaints/map?category=roads&status=overdue` returns safe public marker data. Category values are the supported category slugs; status also accepts assigned, in_progress, resolution_pending_confirmation, reopened, closed, overdue, or escalated.
- `POST /api/complaints/suggestions` requires a citizen session and accepts category plus latitude/longitude. It returns up to eight open same-category reports in the configured recent window and distance radius; suggestions never merge reports.

Nearby-search defaults are DUPLICATE_RADIUS_METERS=1000 and DUPLICATE_LOOKBACK_DAYS=30. Invalid settings fall back to defaults; accepted bounds are 50 m–10 km and 1 day–10 years.

## Private S3-compatible evidence storage

Local filesystem storage remains the default. For private S3, set MEDIA_STORAGE_DRIVER=s3, S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY. Set S3_SESSION_TOKEN for temporary credentials. S3_ENDPOINT supports a custom S3-compatible endpoint, and S3_FORCE_PATH_STYLE=true enables path-style addressing when required. Custom endpoints must use HTTPS in production.

The adapter does not set a public ACL or expose bucket URLs. It signs requests and streams evidence through the existing authorized /api/evidence/:mediaId endpoint. Configure bucket encryption, lifecycle, and a least-privilege IAM policy in your account. No cloud resources or credentials are created or included by this project. Keep secrets in a secret manager or local .env file.

For local deployment, Compose keeps evidence on the persistent civic_private_uploads volume. For hosted/serverless deployment, use private object storage and a durable PostgreSQL service. Local storage on ephemeral hosts will lose uploaded files.

Unauthenticated ticket lookup intentionally omits the complaint description, saved location, event notes, and account identifiers. Ticket IDs are random but should still be treated as bearer references.

## Public support contact

The footer Contact page opens the configured address in the visitor's email application; the application does not send email. To configure it, set the `content` value on `<meta name="support-email">` in `index.html` to an address monitored by your deployment. Leave it empty when no public support address is available. No support address is assumed by the project.

### Citizen report request

Request JSON:

```json
{
  "title": "Pothole near the park",
  "description": "A large pothole is damaging vehicles.",
  "category": "roads",
  "location": {
    "mapX": 120,
    "mapY": 90
  }
}
```

`title` is optional when a description is provided; the server uses its first line. Categories are `roads`, `water`, `power`, `garbage`, `drain`, `parks`, `lights`, and `other`. Schematic map coordinates are optional. A real `latitude` and `longitude` pair is accepted and range-checked when provided.

Successful response (`201`):

```json
{
  "complaint": {
    "id": "1",
    "ticketId": "CIV-0123456789ABCDEF",
    "title": "Pothole near the park",
    "description": "A large pothole is damaging vehicles.",
    "category": { "slug": "roads", "label": "Roads" },
    "department": { "slug": "roads", "name": "Roads Department" },
    "status": "assigned",
    "createdAt": "2026-10-19T12:00:00.000Z",
    "updatedAt": "2026-10-19T12:00:00.000Z",
    "dueAt": "2026-10-21T12:00:00.000Z",
    "location": { "latitude": null, "longitude": null, "mapX": 120, "mapY": 90 },
    "events": [
      {
        "eventType": "submitted",
        "previousStatus": null,
        "newStatus": "assigned",
        "note": "Complaint submitted and assigned to the responsible department.",
        "createdAt": "2026-10-19T12:00:00.000Z"
      }
    ]
  }
}
```

The IDs and timestamps above illustrate the response shape; actual values are generated at runtime. The ticket suffix is random. The database stores the numeric internal ID separately.

### `GET /api/complaints/:ticketId`

Returns the same `complaint` object with its persisted history, or `404` if no matching ticket exists. Ticket IDs are case-insensitive and look like `CIV-` followed by 16 hexadecimal characters.

### `GET /api/health`

Returns `200` with `{ "status": "ok", "database": "connected" }` when PostgreSQL is reachable, or `503` when it is unavailable.

Errors use `{ "error": { "code": "...", "message": "..." } }`.

## Demonstration SLA rules

The migration seeds configurable example durations in `issue_categories.sla_hours`: roads 48 hours; water, power, garbage, drainage, and street lights 24 hours; parks and other 72 hours. Edit these values in that table to configure local demonstration rules. They are prototype values, not official municipal deadlines. The deadline is calculated from PostgreSQL time when the complaint is inserted.

## Security and current limits

- Authentication uses bcryptjs password hashes and HMAC-signed JWT cookies. Configure a unique `JWT_SECRET`; changing or losing it invalidates all active sessions.
- Role and department permissions are checked in API middleware and department-scoped database queries. Signup cannot assign a privileged role.
- Request fields and coordinates are validated server-side; SQL uses parameters; request bodies are limited to 32 KB.
- Local evidence files are private, but local disk may be ephemeral on hosted services; use the S3 adapter there.
- The simple rate limiter is in memory and does not share counters between multiple app instances; use a shared store for a multi-instance public deployment.
- Sample ticket `48872`, notification examples, ward data, resolved sample cards, and homepage/secondary dashboard charts remain visibly illustrative. Citizen saved reports, officer queues and counts, administrator metrics, the public issue map, and nearby suggestions use persisted records.
- Before public deployment, use shared rate-limit storage across app instances, add abuse controls and password recovery, and complete an operational security review.

## Development checks

```powershell
npm test
npm run check
node --check server/server.js
node --check server/routes/auth.js
node --check server/routes/complaints.js
node --check server/routes/officer.js
node --check script.js
```

`npm test` runs request-validation and S3 adapter unit tests. If `TEST_DATABASE_URL` points to an isolated PostgreSQL test database, it creates a unique temporary schema, applies all four migrations, and runs authentication, privacy, geographic map/suggestion, evidence, escalation, workflow, and metrics integration checks. It drops only that generated schema and temporary upload directory. Database integration tests are skipped when `TEST_DATABASE_URL` is unset.

GitHub Actions runs npm ci, npm run check, and the database-backed suite against PostgreSQL 16 for pushes and pull requests. This configuration prepares the app for deployment; it does not deploy it or make this MVP production-ready.
