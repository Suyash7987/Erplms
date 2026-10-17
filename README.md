# School ERP + LMS (Phase 1 MVP)

Multi-tenant School ERP + LMS for Indian schools (Class 1–12). Mobile-first web app (PWA) backed by a
versioned REST API.

| Part       | Tech                                                                       |
| ---------- | -------------------------------------------------------------------------- |
| `apps/web` | Next.js 15 (App Router, plain JS), Tailwind CSS 3, PWA (manifest + SW)     |
| `apps/api` | Express 5 REST API under `/api/v1`, Prisma 6 + PostgreSQL, Zod, pino, Jest |
| worker     | BullMQ + Redis processors and cron schedulers (`apps/api/src/worker`)      |
| `infra`    | Dockerfiles and `docker-compose.yml` (postgres, redis, api, worker, web)   |

## Prerequisites

- Node.js 22+ and npm 10+
- Docker Desktop (for Postgres 16 and Redis 7), **or** your own Postgres and Redis

## Local setup

```bash
npm install                                   # installs both workspaces, runs `prisma generate`
cp apps/api/.env.example apps/api/.env        # PowerShell: Copy-Item apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run infra:up                              # postgres + redis in Docker
```

Then, in three terminals:

```bash
npm run dev:api      # http://localhost:4000/api/v1
npm run dev:worker   # BullMQ worker + cron schedulers
npm run dev:web      # http://localhost:3000
```

Or run everything in containers: `npm run stack:up` (stop with `npm run stack:down`).

If port 5432 or 6379 is already used by a local install, set `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT`
before `npm run infra:up` and update `DATABASE_URL` / `REDIS_URL` in `apps/api/.env` to match.

## Useful URLs

| URL                                      | What                                           |
| ---------------------------------------- | ---------------------------------------------- |
| http://localhost:3000                    | Web app (shows live API / DB / Redis status)   |
| http://localhost:4000/api/v1/health      | Readiness: checks Postgres and Redis (200/503) |
| http://localhost:4000/api/v1/health/live | Liveness: process only                         |
| http://localhost:4000/api/v1/docs        | Swagger UI (disabled in production by default) |

The web app proxies `/api/v1/*` to the API (Next.js rewrite, target `API_INTERNAL_URL`), so the browser
only ever talks to the web origin and auth cookies stay first-party.

## Scripts

| Command                             | Description                              |
| ----------------------------------- | ---------------------------------------- |
| `npm run lint`                      | ESLint in both workspaces                |
| `npm test`                          | Jest + Supertest (API)                   |
| `npm run format`                    | Prettier (write); `format:check` in CI   |
| `npm run build:web`                 | Production build of the web app          |
| `npm run db:migrate -w @erplms/api` | Create/apply Prisma migrations (from M2) |

## Architecture rules

- API request flow: `routes -> controller -> service -> Prisma`. Controllers are thin; business logic
  lives in services. ESLint blocks `require('...prisma...')` in `*.routes.js` and `*.controller.js`.
- Every route validates `params`, `query` and `body` with Zod via `validate()`; parsed values are on
  `req.valid`.
- One error middleware returns `{ error: { code, message, details, requestId } }`. Stack traces are
  only included in development.
- Config comes only from environment variables, validated with Zod at startup (`src/config/env.js`).
  The process exits with a readable list of problems if anything is missing or invalid.
- Timestamps are stored and returned as UTC ISO-8601. Calendar dates (attendance day, due dates, cron
  schedules) are computed in `APP_TIMEZONE` (default `Asia/Kolkata`) via `src/lib/time.js`.

## Data residency (DPDP)

The code is region-agnostic, but **production must be hosted in India** (for example AWS `ap-south-1`
Mumbai) for the database, Redis, object storage and backups, because the system stores children's
personal data. Set `DATA_REGION` to the hosting region; the API logs a warning at startup in production
if it is not an `ap-south-*` region.

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
