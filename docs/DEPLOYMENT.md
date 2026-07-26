# Deployment Guide

## Services

Run three independent processes:

1. PostgreSQL 17.
2. The FastAPI solver on a private network interface.
3. The Next.js application behind an HTTPS reverse proxy.

The browser must never reach PostgreSQL or the solver directly.

## Required environment

Create production secrets outside the repository:

```text
NODE_ENV=production
APP_URL=https://timetable.example.edu
AUTH_SECRET=<at least 32 random characters>
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
SOLVER_BASE_URL=http://127.0.0.1:8001
SOLVER_INTERNAL_TOKEN=<random internal service token>
SOLVER_REQUEST_TIMEOUT_SECONDS=40
LOG_LEVEL=info
```

Use separate database and solver credentials per environment. Do not commit
`.env`.

## Build and migrate

```bash
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm prisma migrate deploy
pnpm build

uv sync --project services/solver --locked --no-dev
```

Back up PostgreSQL before every migration. Applied Prisma migrations are
immutable.

## Start

```bash
pnpm --filter @school-timetable/web start
uv run --project services/solver uvicorn app.main:app \
  --app-dir services/solver --host 127.0.0.1 --port 8001
```

On Windows, run PostgreSQL as its existing Windows service and use Task
Scheduler or a service wrapper for the two application processes. On Linux, use
separate `systemd` units with restart policies and non-administrator accounts.

## Reverse proxy

- Terminate TLS at the reverse proxy.
- Forward only the Next.js port.
- Set a request-body limit of 1 MB for the web application.
- Do not expose solver port `8001`.
- Preserve `Host` and forwarding headers.

The application adds clickjacking, content-sniffing, referrer, and browser
permissions headers. The solver separately rejects payloads above 5 MB and can
require `SOLVER_INTERNAL_TOKEN`.

## Release verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e

uv run --project services/solver ruff format --check services/solver
uv run --project services/solver ruff check services/solver
uv run --project services/solver mypy services/solver/app
uv run --project services/solver pytest services/solver/tests
```

Verify `/api/health` and the private solver `/health` before sending traffic.

## Operations

- Schedule encrypted PostgreSQL backups and test restoration.
- Retain generation fingerprints, diagnostics, schedule versions, and audit
  events.
- Rotate `AUTH_SECRET` and `SOLVER_INTERNAL_TOKEN` through the deployment secret
  manager.
- Review failed generation jobs and HTTP 413/401 responses.
- Apply dependency upgrades only through reviewed lockfile changes and the full
  release gate.
