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

   `CREATEDB` lets Prisma create its temporary shadow database during `prisma migrate dev`.

2. Install dependencies and create the env file:

   ```bash
   npm install                                   # installs both workspaces, runs `prisma generate`
   cp apps/api/.env.example apps/api/.env        # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
   ```

   Edit `DATABASE_URL` in `apps/api/.env` if your Postgres user, password or port differ.
   The web app needs no env file unless the API is not on `http://localhost:4000`
   (then copy `apps/web/.env.example` to `apps/web/.env.local`).

3. Start both apps with one command:

   ```bash
   npm run dev          # api on http://localhost:4000/api/v1, web on http://localhost:3000
   ```

   `npm run dev:api` and `npm run dev:web` start them individually.

## Useful URLs

| URL                                      | What                                       |
| ---------------------------------------- | ------------------------------------------ |
| http://localhost:3000                    | Web app (shows live API / database status) |
| http://localhost:4000/api/v1/health      | Readiness: checks Postgres (200/503)       |
| http://localhost:4000/api/v1/health/live | Liveness: process only                     |

The web app proxies `/api/v1/*` to the API (Next.js rewrite, target `API_INTERNAL_URL`), so the browser
only ever talks to the web origin and auth cookies stay first-party.

## Scripts

| Command              | Description                            |
| -------------------- | -------------------------------------- |
| `npm run dev`        | API + web together (`concurrently`)    |
| `npm run lint`       | ESLint in both workspaces              |
| `npm test`           | Jest + Supertest (API)                 |
| `npm run format`     | Prettier (write); `format:check` in CI |
| `npm run build:web`  | Production build of the web app        |
| `npm run db:migrate` | Create/apply Prisma migrations         |
| `npm run db:studio`  | Browse the database with Prisma Studio |

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
- [ ] M2 Foundation schema, RLS, tenant isolation
- [ ] M3 Auth + RBAC
- [ ] M4 Institute setup and academic structure
- [ ] M5 Students, guardians, staff (+ bulk import)
- [ ] M6 Attendance
- [ ] M7 Timetable
- [ ] M8 Notices and notifications
- [ ] M9 Fees and payments
- [ ] M10 Dashboards and hardening
