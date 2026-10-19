# School ERP + LMS (Phase 1 MVP)

Multi-tenant School ERP + LMS for Indian schools (Class 1–12). Mobile-first web app (PWA) backed by a
versioned REST API. Everything runs with just Node.js and PostgreSQL.

| Part       | Tech                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| `apps/web` | Next.js 15 (App Router, plain JS), Tailwind CSS 3, PWA (manifest + SW) |
| `apps/api` | Express 5 REST API under `/api/v1`, Prisma 6 + PostgreSQL, Zod, pino   |
| tooling    | npm workspaces, `concurrently`, ESLint + Prettier, Jest + Supertest    |

## Prerequisites

- Node.js 22+ and npm 10+
- PostgreSQL 14+ running locally (or anywhere reachable via `DATABASE_URL`)

## Local setup

1. Create the database role and database (once). In `psql` as a superuser (for example `postgres`):

   ```sql
   CREATE ROLE erplms LOGIN PASSWORD 'erplms_dev_password' CREATEDB;
   CREATE DATABASE erplms OWNER erplms;
   ```

   - `CREATEDB` lets Prisma create its shadow database and lets the tests create `erplms_test`.
   - The role must **own** the database (PostgreSQL 15+ only lets the owner create tables in
     `public`). If you created the database in pgAdmin, run `ALTER DATABASE erplms OWNER TO erplms;`.
   - Never use a superuser (such as `postgres`) in `DATABASE_URL`: superusers bypass Row Level
     Security. The API logs an error at startup (and refuses to start in production) if you do.

2. Install dependencies and create the env file:

   ```bash
   npm install                                   # installs both workspaces, runs `prisma generate`
   cp apps/api/.env.example apps/api/.env        # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
   ```

   Edit `DATABASE_URL` in `apps/api/.env` if your Postgres user, password or port differ.
   The web app needs no env file unless the API is not on `http://localhost:4000`
   (then copy `apps/web/.env.example` to `apps/web/.env.local`).

3. Create the tables and load demo data:

   ```bash
   npm run db:migrate   # applies prisma/migrations (schema, CHECK constraints, RLS policies)
   npm run db:seed      # demo institute; prints the demo logins
   ```

4. Start both apps with one command:

   ```bash
   npm run dev          # api on http://localhost:4000/api/v1, web on http://localhost:3000
   ```

   `npm run dev:api` and `npm run dev:web` start them individually.

## Demo data

`npm run db:seed` creates **Demo Public School** (institute code `demo`, CBSE, academic year 2026-27)
with Classes 1-12 (sections A and B), subjects, staff, and 20 students in Classes 1-A, 5-A, 6-A and 10-A.
`npm run db:reset` drops the database, re-applies migrations and seeds again.

| Role         | Phone                 | Password        | Notes                                   |
| ------------ | --------------------- | --------------- | --------------------------------------- |
| Admin        | 9000000001            | `Admin@1234`    | Meera Iyer                              |
| Accountant   | 9000000002            | `Accounts@1234` | Rakesh Gupta                            |
| Front office | 9000000003            | `Office@1234`   | Pooja Nair                              |
| Teacher      | 9000000011-9000000014 | `Teacher@1234`  | 9000000011 is also a parent (Class 6-A) |
| Parent       | 9000000101-9000000118 | `Parent@1234`   | 9000000101 has two children (siblings)  |
| Student      | 9000000201-9000000205 | `Student@1234`  | Class 10-A students                     |

Demo accounts skip the forced password change. Login itself arrives in M3.

## Useful URLs

| URL                                      | What                                       |
| ---------------------------------------- | ------------------------------------------ |
| http://localhost:3000                    | Web app (shows live API / database status) |
| http://localhost:4000/api/v1/health      | Readiness: checks Postgres (200/503)       |
| http://localhost:4000/api/v1/health/live | Liveness: process only                     |

The web app proxies `/api/v1/*` to the API (Next.js rewrite, target `API_INTERNAL_URL`), so the browser
only ever talks to the web origin and auth cookies stay first-party.

## Scripts

| Command              | Description                             |
| -------------------- | --------------------------------------- |
| `npm run dev`        | API + web together (`concurrently`)     |
| `npm run lint`       | ESLint in both workspaces               |
| `npm test`           | Unit + integration tests (API)          |
| `npm run format`     | Prettier (write); `format:check` in CI  |
| `npm run build:web`  | Production build of the web app         |
| `npm run db:migrate` | Create/apply Prisma migrations          |
| `npm run db:seed`    | Load the demo institute                 |
| `npm run db:reset`   | Drop, re-migrate and re-seed (dev only) |
| `npm run db:studio`  | Browse the database with Prisma Studio  |

### Tests

- `npm run test:unit -w @erplms/api`: no database needed.
- `npm run test:integration -w @erplms/api`: drops and recreates a separate **`<your db>_test`**
  database (for example `erplms_test`), applies all migrations and runs the tenant-isolation and
  database-guard tests. Your development database is never touched. Set `TEST_DATABASE_URL` to use a
  different one (its name must end in `_test`).

## Multi-tenancy and data safety

- Every tenant table has `institute_id` and Postgres **Row Level Security** (`apps/api/prisma/rls.sql`,
  applied by the `*_tenant_rls` migration). Policies are `FORCE`d so they apply to the table owner too.
- Services run tenant work through `withTenant(instituteId, async (tx) => ...)` from
  `src/lib/prisma.js`. It opens a transaction and sets `app.institute_id` (the parameterised form of
  `SET LOCAL`). Without it, tenant tables return no rows and reject writes. Services also filter by
  `instituteId` as a second layer.
- Relations between tenant tables are composite foreign keys on `(institute_id, id)`, so a row can
  never point at another institute's record.
- `payments`, `payment_reversals` and `audit_logs` are append-only (a trigger rejects UPDATE/DELETE).
  Money is `BIGINT` paise; CHECK constraints guard amounts, invoice totals and payment references.
- Students are never hard-deleted; leaving is a status change. Per-year placement lives in
  `student_enrollments`.

## Architecture rules

- API request flow: `routes -> controller -> service -> Prisma`. Controllers are thin; business logic
  lives in services. ESLint blocks `require('...prisma...')` in `*.routes.js` and `*.controller.js`.
- Every route validates `params`, `query` and `body` with Zod via `validate()`; parsed values are on
  `req.valid`.
- One error middleware returns `{ error: { code, message, details, requestId } }`. Stack traces are
  only included in development.
- Config comes only from environment variables, validated with Zod at startup (`src/config/env.js`).
  The process exits with a readable list of problems if anything is missing or invalid.
- Rate limiting is in-memory (`express-rate-limit`); no external cache or queue is used.
- Timestamps are stored and returned as UTC ISO-8601. Calendar dates (attendance day, due dates) are
  computed in `APP_TIMEZONE` (default `Asia/Kolkata`) via `src/lib/time.js`.

## Data residency (DPDP)

The code is region-agnostic, but **production must be hosted in India** (for example AWS `ap-south-1`
Mumbai) for the database and backups, because the system stores children's personal data. Set
`DATA_REGION` to the hosting region; the API logs a warning at startup in production if it is not an
`ap-south-*` region.

## Milestones

- [x] M1 Repo scaffolding
- [x] M2 Foundation schema, RLS, tenant isolation
- [ ] M3 Auth + RBAC
- [ ] M4 Institute setup and academic structure
- [ ] M5 Students, guardians, staff (+ bulk import)
- [ ] M6 Attendance
- [ ] M7 Timetable
- [ ] M8 Notices and notifications
- [ ] M9 Fees and payments
- [ ] M10 Dashboards and hardening
