# AGENTS.md

## Product

This repository implements a school weekly timetable generator. Read these files before changing scheduling behavior:

- `docs/PRODUCT_BLUEPRINT.md`
- `docs/DATA_MODEL.md`
- `docs/SOLVER_CONTRACT.md`
- `docs/ACCEPTANCE_TESTS.md`
- `docs/IMPLEMENTATION_STATUS.md`

## Core rule

Never silently weaken, remove, or reinterpret a hard scheduling constraint to make a test pass or obtain a feasible schedule. Report infeasibility explicitly.

## Working method

- For work spanning multiple modules or more than one session, create or update an execution plan in `docs/IMPLEMENTATION_STATUS.md`.
- Inspect existing code and tests before editing.
- Make the smallest coherent change that completes the task.
- Keep domain logic out of React components.
- Keep solver logic independent from the database and UI.
- Update documentation whenever the contract or behavior changes.
- Do not add post-MVP features unless explicitly requested.

## TypeScript standards

- Use TypeScript strict mode.
- Do not use `any` unless justified in a comment.
- Validate external inputs with Zod.
- Prefer explicit domain types and stable error codes.
- Use Prisma migrations for schema changes.
- Add tests for business logic.

## Python standards

- Use type annotations.
- Validate API payloads with Pydantic.
- Format and lint with Ruff.
- Type-check with the configured type checker.
- Test with pytest.
- Keep CP-SAT model construction split into hard constraints, soft constraints, and objective modules.
- Every solver behavior change requires a focused fixture and test.
- Post-validate every returned schedule.

## Commands

Codex must discover and keep these commands accurate in the repository README and package scripts:

```bash
pnpm install
pnpm dev
pnpm solver:dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm prisma migrate dev
pnpm prisma db seed

cd services/solver
uv sync --locked
uv run pytest
uv run ruff check .
uv run mypy app
```

If the actual commands differ, update this file and the README in the same change.

Local development is native-first on Windows. PostgreSQL runs as a Windows
service; Docker Desktop is not required. CI may use a PostgreSQL service
container on the GitHub-hosted runner.

## Database

- Use PostgreSQL and Prisma.
- Use UUID primary keys.
- Do not edit applied migrations.
- Do not delete referenced historical schedule data.
- Do not use JSON fields instead of normalized core entities.
- Persist immutable solver request snapshots and fingerprints.

## API and security

- Authenticate administrative routes.
- Authorize records by school ID.
- Keep secrets in environment variables.
- Never commit `.env` or credentials.
- Return structured errors with stable codes.
- Do not expose Python stack traces to the browser.

## Testing gate

Before declaring a task complete, run the relevant subset and, when feasible, the full suite:

- formatting
- lint
- TypeScript type check
- web unit tests
- solver tests
- integration tests
- end-to-end tests for changed critical flows

State what was run and disclose anything that could not be run.
