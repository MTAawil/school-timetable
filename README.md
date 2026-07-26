# School Timetable

A single-school weekly timetable application. The repository separates the
Next.js administration application from the database-independent Python
optimization service.

Phase 0 provides the development foundation only. Scheduling domain screens and
CP-SAT model behavior begin in later phases documented under `docs/`.

## Architecture

```text
apps/web              Next.js App Router application and API
packages/database     Prisma client ownership and PostgreSQL adapter
packages/shared       Stable error codes, DTOs, and Zod contracts
services/solver       FastAPI and Google OR-Tools service
prisma                Schema, migrations, and seed entry point
```

The browser calls the Next.js application. The application owns persistence and
later sends complete immutable snapshots to the solver. The solver never queries
PostgreSQL.

## Prerequisites

- Git 2.55 or newer
- Node.js 24 LTS
- pnpm 10.34.5
- Python 3.12
- uv 0.11 or newer
- PostgreSQL 17
- Google Chrome for the local Playwright smoke test

Docker Desktop is not required. PostgreSQL runs natively as the Windows service
`postgresql-x64-17`.

## First Setup

1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` for the local PostgreSQL database.
3. Install and lock dependencies:

```bash
pnpm install
uv sync --project services/solver --locked
```

4. Generate the Prisma client and apply migrations:

```bash
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma db seed
```

The current local development connection is:

```text
postgresql://timetable:timetable@localhost:5432/timetable
```

These credentials are for local development only.

## Run Locally

Start the web application:

```bash
pnpm dev
```

Start the solver in another terminal:

```bash
pnpm solver:dev
```

Services:

- Web application: `http://localhost:3000`
- Web health: `http://localhost:3000/api/health`
- Solver health: `http://localhost:8000/health`
- Solver OpenAPI: `http://localhost:8000/docs`

## Quality Commands

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build

pnpm solver:format:check
pnpm solver:lint
pnpm solver:typecheck
pnpm solver:test
```

On this Windows installation, PowerShell may block `pnpm.ps1`. Use `pnpm.cmd`
when invoking pnpm directly if that occurs.

## Database Commands

```bash
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma db seed
```

Do not edit an applied migration. Domain schema work starts in Phase 1.

## Current Scope

Implemented:

- pnpm monorepo
- Next.js production build
- PostgreSQL and Prisma domain model
- School, term, calendar, teacher, subject, class, room, availability,
  requirement, constraint, generation, schedule, assignment, and audit records
- Database constraints for calendar ranges, workloads, requirement counts,
  schedule versions, and assignment positions
- Idempotent sample-school seed data
- School-scoped repository boundaries and domain validation services
- Administrator authentication with signed HTTP-only sessions
- Responsive setup UI for calendar, teachers, subjects, classes, rooms,
  requirements, and teacher availability
- Deterministic readiness validation with actionable capacity and collision
  diagnostics
- Canonical versioned solver snapshots with SHA-256 fingerprints
- FastAPI solver API with a Google OR-Tools CP-SAT hard-constraint model
- Exact-demand timetable generation with independent post-solve validation
- Immutable generation jobs, alternatives, diagnostics, and result UI
- Configurable soft-constraint weights with exact named penalty breakdowns
- Quality-bounded generation and comparison of up to five diverse alternatives
- Whole-school, class, teacher, and room timetable views
- Draft editing with move previews, drag-and-drop, swap, unassigned lessons,
  lock controls, atomic hard-constraint rejection, and version history
- Partial regeneration with hard-fixed locks, existing-placement hints,
  movement reporting, and derived draft versions
- Shared validation and error-code package
- Unit, component, solver, and authenticated browser tests with GitHub Actions CI

Not implemented yet:

- Timetable publishing, exports, and infeasibility diagnostics

See `docs/IMPLEMENTATION_STATUS.md` for the delivery sequence.
