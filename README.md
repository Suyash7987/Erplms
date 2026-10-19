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

Sign in at http://localhost:3000/login with institute code `demo`. Demo accounts skip the forced
password change; parents see the DPDP consent screen on their first sign-in.

## Sign-in, sessions and permissions

- **Login** is institute code + mobile number + password (one phone can exist in several schools).
  The API sets two httpOnly, `SameSite=Strict` cookies: a 15-minute access JWT (`erp_at`, path
  `/api/v1`) and a 30-day refresh JWT (`erp_rt`, path `/api/v1/auth`). JavaScript never sees tokens.
- **Refresh rotation:** every refresh issues a new refresh token; tokens are stored SHA-256-hashed in
  `refresh_tokens`. Presenting an already-rotated token revokes the whole session family (theft
  detection); two tabs refreshing at the same moment are tolerated.
- **Lockout:** 5 wrong passwords lock the account for 15 minutes (`failed_attempts`, `locked_until`).
  Login is also rate limited per account and per IP (in memory).
- **Onboarding:** users with a temporary password must change it first, and parents must accept the
  DPDP consent (`consents` table, versioned in `src/config/consent.js`). Until then the API answers
  `PASSWORD_CHANGE_REQUIRED` / `CONSENT_REQUIRED` for everything except the auth endpoints.
- **Profiles:** one user can hold several roles (a teacher who is also a parent) and a parent gets one
  profile per child. The JWT carries the active role and profile; `POST /auth/switch-profile` changes it.
- **RBAC as data:** `requirePermission('fees.collect')` checks the active role's permissions, loaded
  from the database on every request (role changes apply immediately), and returns `MODULE_DISABLED`
  when the institute has switched the module off. Nobody can grant permissions they do not hold, and
  password resets cannot take over accounts with more privileged access.
- **Audit:** logins, failed logins, lockouts, logouts, password changes and resets, refresh-token
  reuse, consent and role changes are written to `audit_logs`.

| Endpoint                                    | Who                    | What                                 |
| ------------------------------------------- | ---------------------- | ------------------------------------ |
| `POST /api/v1/auth/login`                   | anyone                 | Sign in                              |
| `POST /api/v1/auth/refresh`                 | signed in              | Rotate tokens                        |
| `POST /api/v1/auth/logout`                  | signed in              | End this device's session            |
| `GET /api/v1/auth/me`                       | signed in              | Session: user, profiles, permissions |
| `POST /api/v1/auth/change-password`         | signed in              | Change password (signs out others)   |
| `POST /api/v1/auth/switch-profile`          | signed in              | Switch role / child                  |
| `GET, POST /api/v1/auth/consent`            | parent profile         | Read / accept DPDP consent           |
| `GET /api/v1/users`                         | `users.view`           | List users (page, limit, q, role)    |
| `POST /api/v1/users/:id/reset-password`     | `users.reset_password` | Temporary password, shown once       |
| `POST/DELETE /api/v1/users/:id/roles`       | `roles.manage`         | Assign / remove a role               |
| `GET /api/v1/roles`, `/roles/permissions`   | `roles.view`           | Roles and the permission catalog     |
| `POST /api/v1/roles`, `PUT .../permissions` | `roles.manage`         | Custom roles and their permissions   |

## Institute setup and academic structure

Admins (permission `institute.manage`) get a first-time **setup wizard** at `/admin/setup`: school
details and UI labels, current academic year, classes (one click for Class 1-12 with grade bands),
sections for every class, and subjects. It can be resumed at any step. Afterwards, `/admin/classes`
lets you open each section to set its class teacher and which teacher teaches each subject.

- **Academic years:** dates must not overlap; exactly one year is `current` (changes are serialised
  with a row lock). Each year gets its own receipt counter for fee collection.
- **Levels** (classes) are permanent and have an optional grade band (primary 1-5, middle 6-8,
  secondary 9-10, senior 11-12). **Sections** belong to one level and one academic year.
- **Labels** such as "Class"/"Section" are institute settings (`settings.labels`), so coaching
  "batches" can reuse the same model. Module switches live in `enabled_modules`.
- Records in use cannot be deleted (years with sections, classes with sections, sections with
  students, subjects taught somewhere); mark them inactive instead.

| Endpoint                                           | Permission         | What                                    |
| -------------------------------------------------- | ------------------ | --------------------------------------- |
| `GET/PATCH /api/v1/institute`                      | `institute.*`      | Profile, board, settings, module flags  |
| `GET /api/v1/institute/setup`                      | `institute.view`   | Wizard progress                         |
| `POST /api/v1/institute/setup/profile`             | `institute.manage` | Save school details (wizard step 1)     |
| `POST /api/v1/institute/setup/complete`            | `institute.manage` | Mark setup complete                     |
| `GET/POST /api/v1/academic-years`                  | `academics.*`      | List / create (optionally make current) |
| `PATCH/DELETE /api/v1/academic-years/:id`          | `academics.manage` | Edit dates / delete an unused year      |
| `POST /api/v1/academic-years/:id/make-current`     | `academics.manage` | Switch the current year                 |
| `GET/POST /api/v1/levels`, `POST /levels/range`    | `academics.*`      | Classes; bulk "Class 1-12"              |
| `GET/POST /api/v1/sections`, `POST /sections/grid` | `academics.*`      | Sections of a year; bulk A, B, ...      |
| `GET/PUT /api/v1/sections/:id/subjects`            | `academics.*`      | Subjects and their teachers per section |
| `GET/POST/PATCH/DELETE /api/v1/subjects`           | `academics.*`      | Subjects (single or bulk create)        |
| `GET /api/v1/staff`                                | `staff.view`       | Staff search for teacher pickers        |

## Students, guardians, staff and CSV import

- **Students** are permanent records; leaving is a status change (`transferred`, `passed_out`, `left`
  close the year's enrollment and disable the student's own login). Per-year placement is a
  `student_enrollments` row (`PUT /students/:id/enrollment`).
- **Guardians are matched by mobile number.** Adding a child with a parent's existing number links
  the siblings to the same guardian and login. A teacher's number simply gains the parent role.
- **Logins** are created for every new guardian (and optionally older students or staff) with a
  temporary password that is returned **once** (`Cache-Control: no-store`) and must be changed at
  first sign-in. Front office can create parent/student logins; staff roles need `staff.create` and
  nobody can grant permissions they do not hold. Marking staff `inactive`/`left` removes their staff
  roles (a parent role stays).
- **CSV import** (`/admin/import`): download the template, choose a CSV (Excel: "Save as CSV UTF-8"),
  check it (dry run with preview and row-level errors), then import. Up to 2,000 rows and 1 MB per
  file; the file is read in the browser and parsed in memory on the server (no uploads). Imports are
  all-or-nothing in one transaction; rows with errors block the import unless you choose to skip
  them. Dates may be `DD-MM-YYYY`. A 2,000-row file with ~3,000 new parent logins takes ~15 s.
  `.xlsx` files are not read directly (that needs an extra library).
- Temporary passwords are hashed with a lower bcrypt cost (6) because they are random 10-character
  secrets that must be replaced; passwords people choose use `BCRYPT_ROUNDS`.

| Endpoint                                           | Permission                             |
| -------------------------------------------------- | -------------------------------------- |
| `GET/POST /api/v1/students`, `GET/PATCH /:id`      | `students.view/create/update`          |
| `POST /api/v1/students/:id/status`                 | `students.archive`                     |
| `PUT /api/v1/students/:id/enrollment`              | `students.update`                      |
| `POST/PATCH/DELETE /api/v1/students/:id/guardians` | `students.update` + `guardians.manage` |
| `GET /api/v1/guardians`, `GET/PATCH /:id`          | `guardians.view/manage`                |
| `GET/POST /api/v1/staff`, `GET/PATCH /:id`         | `staff.view/create/update`             |
| `GET /api/v1/imports/:type/template`               | `students.import` / `staff.import`     |
| `POST /api/v1/imports/students` or `/staff`        | `students.import` / `staff.import`     |

## Attendance

- **Marking** (`/teacher/attendance`, `/admin/attendance`): everyone starts present; tap a child to
  mark absent, or choose late / half day / leave. Students with approved leave default to "on leave".
  Teachers can mark sections where they are class teacher or teach a subject; admins
  (`attendance.edit_any`) can mark any section.
- **Rules:** no future dates; the date must be inside the section's academic year; teachers can mark
  or change up to `settings.attendance.editWindowDays` days back (default 2), admins any time. Once
  or twice a day follows `settings.attendance.sessionsPerDay`. One record per student per date per
  session is guaranteed by the database; concurrent saves of the same section are serialised.
- **Absence alerts:** every newly absent student creates an in-app notification for each guardian
  with a login (re-saving never sends duplicates). The bell and list arrive in M8.
- **Audit:** the first marking and every later change (with before/after per student).
- **Reports** (`attendance.report`): daily across all sections, and a monthly register per section
  with percentages (present and late count fully, half day as half) and CSV download.
- **Parents and students** (`/parent/attendance`, `/student/attendance`) see the active child's
  month as a colour calendar plus year-to-date percentage. The API checks the guardian link on
  every request, not only the profile in the token.

| Endpoint                                                 | Permission            |
| -------------------------------------------------------- | --------------------- |
| `GET /api/v1/attendance/sections`                        | `attendance.mark`     |
| `GET /api/v1/attendance/roster?sectionId&date`           | `attendance.view`     |
| `PUT /api/v1/attendance/roster`                          | `attendance.mark`     |
| `GET /api/v1/attendance/reports/daily?date`              | `attendance.report`   |
| `GET /api/v1/attendance/reports/monthly?sectionId&month` | `attendance.report`   |
| `GET /api/v1/attendance/me?month`                        | `attendance.view_own` |

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
- [x] M3 Auth + RBAC
- [x] M4 Institute setup and academic structure
- [x] M5 Students, guardians, staff (+ bulk import)
- [x] M6 Attendance
- [ ] M7 Timetable
- [ ] M8 Notices and notifications
- [ ] M9 Fees and payments
- [ ] M10 Dashboards and hardening
