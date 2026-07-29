# Implementation Status

## Current phase

Stable single-school MVP complete on `main`. Supervisor workflow redesign R7 is
complete on `feature/supervisor-workflow-redesign`; R8 verification is in
progress.

### 2026-07-29 - Portable local database backup

- Added Windows PowerShell backup and restore scripts using PostgreSQL custom
  archives.
- Backup creation verifies the archive and writes a SHA-256 checksum without
  storing database credentials.
- Rehearsed a full restore into a temporary database and verified 9 teachers,
  45 curriculum rows, and 8 generation jobs before removing the temporary
  database.

## Decisions

- Build a single-school MVP before adding any multi-school or billing behavior.
- Use a pnpm workspace with a Next.js App Router application, a shared TypeScript
  package, a root Prisma schema, and an independently packaged Python solver.
- Use Node.js 24 LTS and pnpm 10 for the TypeScript workspace.
- Use Python 3.12 with `uv` for the solver environment. Keep runtime and
  development dependencies locked in `uv.lock`.
- Use PostgreSQL 17 natively in local development and as a CI service.
- Use Next.js, TypeScript strict mode, Tailwind CSS, Zod, Prisma, bcrypt, and
  signed HTTP-only sessions for the application.
- Use FastAPI, Pydantic, Google OR-Tools CP-SAT, pytest, Ruff, and mypy for the
  solver.
- Keep the solver pure: it receives a complete immutable JSON snapshot and never
  queries the application database.
- The application owns `GenerationJob` persistence. A TypeScript worker that
  polls jobs and calls the solver will be introduced in Phase 5. Phase 0 does not
  create a misleading in-process background queue.
- Rooms are optional per academic term and room constraints can be disabled.
- Persist immutable solver requests, fingerprints, alternatives, and response
  metadata when generation is implemented.
- Generated alternatives are immutable. Editing and regeneration create derived
  draft schedule versions.
- Docker Desktop is intentionally not required on the development laptop. This
  user-approved change replaces local Compose with native services to reduce
  idle memory use.
- Pin direct dependency versions and commit both `pnpm-lock.yaml` and `uv.lock`.
  Dependabot may propose reviewed upgrades; CI must not install floating versions.
- Treat the root README's "Supervisor Workflow Redesign" section as the
  authoritative ordered redesign task list.
- Keep the stable MVP on `main` and implement the redesign on
  `feature/supervisor-workflow-redesign`.
- Use a separate local redesign database before applying redesign migrations so
  branch changes do not alter the stable MVP database.

## Active redesign execution plan

Current task: R7.1 - Teacher-Centered Entry and Restrictions.

1. R0 documentation and fixtures are complete and approved.
2. The isolated redesign database and additive R1 migration are complete.
3. R2 - School Setup Workflow is complete.
4. R3 - Subjects and Curriculum Matrix is complete.
5. R4 - Teacher and Teaching Allocation Workflow is complete.
6. R5 - Teacher Restrictions is complete.
7. R6 - Readiness and Solver Rules is complete.
8. R7 - Simplified Application Flow is complete.
9. Implement the supervisor-requested R7.1 teacher-centered correction.
10. Resume and complete R8 after R7.1 passes its manual review.
11. Update README task statuses and this section after every completed task.
12. Do not merge to `main` before full verification and supervisor approval.

### 2026-07-29 - R7.1 manual-review correction

- Manual testing showed that the class-centered teaching-assignment table does
  not match the supervisor's teacher-by-teacher data-entry process.
- The approved correction combines teacher identity, exact workload,
  class-subject ownership, and the selected teacher's weekly restrictions in
  one Add/Edit Teacher workflow.
- Restriction cells will cycle by click through Available, Preferred, and
  Unavailable, with the entire cell background communicating its state.
- A compact whole-school coverage summary remains available for validation, but
  is no longer the primary assignment-entry method.
- R8 approval is paused until this correction is implemented, tested, and
  manually reviewed.

### 2026-07-29 - R7.1 implementation ready for review

- Replaced the primary class-centered assignment editor with one selected
  teacher workflow containing profile, exact workload, class-subject ownership,
  hard limits, and weekly restrictions.
- Added live declared, allocated, remaining, and excess totals. The combined
  save is disabled and rejected server-side unless the workload is exact.
- Protected class-subject ownership and added explicit confirmation before
  reassigning a class-subject from another teacher.
- Replaced restriction dropdowns with full-background clickable cells cycling
  through Available, Preferred, and Unavailable.
- Saved teacher data, allocations, and restrictions in one school- and
  term-scoped transaction.
- Removed Restrictions from primary navigation and changed readiness correction
  links to the combined Teachers screen; the legacy route remains available for
  compatibility.
- Added shared allocation validation tests, combined editor component coverage,
  and desktop/mobile Playwright coverage including an actual combined save.
- Passed 61 TypeScript tests, lint, strict type-check, the 19-route production
  build, and two focused browser tests.
- Deployed the verified build against the empty `timetable_manual` database on
  port 3103. Supervisor manual review is the only open R7.1 checklist item.

### 2026-07-29 - R7.1 manual-review fixes

- Changed teacher allocation entry to use a subject filter; the visible class
  list contains only curriculum rows for that subject while allocations made
  under other subjects remain selected and are saved together.
- Teachers can be allocated classes from multiple subjects in one workflow.
- Fixed retained React editor state by keying the client editor to the selected
  teacher or new-teacher mode.
- Verified that Edit loads the clicked teacher, Add Teacher clears all profile
  and subject fields, and the allocated total resets to zero.
- Added browser regressions for subject filtering, protected ownership,
  edit identity, add reset, and allocation reset.
- Passed strict type-check, nine web component tests, the production build, and
  two desktop/mobile browser tests. Redeployed port 3103 without deleting the
  supervisor's current manual-test data.

### 2026-07-29 - Live teacher coverage

- Added a live subject coverage summary to the teacher editor.
- Each subject shows assigned sessions, required sessions, remaining sessions,
  and a complete, partial, or unassigned visual state.
- Selecting a subject reveals the classes that still need a teacher.
- Coverage includes unsaved changes for the teacher currently being edited.

### 2026-07-29 - R8 migration and verification

- Applied all migrations to the isolated `timetable_r8` PostgreSQL database.
- Added an idempotent legacy-data converter that preserves historical records
  and verifies normalized week, curriculum, and exact teacher workload data.
- Converted the clean seeded database twice successfully to prove idempotency.
- Added explicit empty-school readiness coverage and a complete supervisor
  Playwright workflow from login through generation, editing, regeneration,
  export, publication, and activity history.
- Fixed schema-version-2 solver compatibility and cross-service fingerprint
  canonicalization.
- Fixed production database pool exhaustion by reusing the process-wide Prisma
  client.
- Passed lint, strict TypeScript, 55 TypeScript unit/component tests, Ruff,
  mypy, 15 solver tests, migration conversion, and the 19-route production
  build.
- The desktop/mobile R7 smoke workflow passed against the converted production
  server. The complete browser workflow reached generation, Teacher view,
  collision rejection, locking, and Undo/Redo checks, but repeated runs were
  unstable on the memory-constrained laptop while a personal Chrome session
  used about 4 GB. Keep the full E2E gate open until one uninterrupted run
  reaches publication.
- Local R8 verification is available on port 3102. Supervisor approval and the
  merge to `main` remain intentionally open.

## Redesign change log

### 2026-07-28 - R0 product contract prepared for review

- Documented the complete supervisor workflow in
  `docs/SUPERVISOR_WORKFLOW.md`.
- Defined the target normalized data model without applying a migration.
- Defined exact workload, daily subject frequency, optional double-session,
  full-time balance, and part-time compactness solver behavior.
- Added stable readiness codes and ten readable redesign acceptance fixtures.
- Left the supervisor-review checklist item open and kept R1 not started.

### 2026-07-28 - R0 approved and R1 started

- The supervisor approved the documented R0 workflow by asking implementation
  to continue.
- Started R1 with the isolated redesign database requirement; no redesign
  migration may be applied to the stable `timetable` database.

### 2026-07-28 - R1 isolated domain migration

- Created local `timetable_redesign` and changed this branch's local and example
  database connection to use it.
- Added normalized `GradeLevel`, `SchoolWeekConfiguration`,
  `GradeCurriculum`, and `ClassCurriculum` entities.
- Added exact teacher weekly sessions, scoped class-subject ownership, and
  grade-specific main-subject and optional-double fields.
- Added PostgreSQL checks for workloads, school-week values, positive
  curriculum sessions, double eligibility, and section identity completeness.
- Preserved all historical `TeachingRequirement` and schedule structures.
- Confirmed the redesign migration and tables exist only in
  `timetable_redesign`; the stable `timetable` database remains unchanged.
- Verified formatting on changed source files, Prisma formatting, workspace
  lint, strict TypeScript checks, and 35 unit/domain/migration tests.
- Root `pnpm format` remains unable to scan the solver's generated
  `.pytest_cache` under the managed Windows sandbox; targeted formatting passed.

### 2026-07-28 - R2 school setup workflow

- Replaced the setup link directory with a direct supervisor workspace for the
  school week and grade sections.
- Added validated working-day selection, uniform session duration, first-session
  time, and one configurable break.
- Rebuilds normalized days, periods, and slots transactionally and refuses
  changes that would invalidate schedule history, fixed requirements, or
  teacher restrictions.
- Added the 17 approved editable grade templates and section counts from zero
  through 52.
- Generates stable spreadsheet-style section labels (`A` through `Z`, then
  `AA`) and predictable names such as `G7-A`.
- Keeps generated class names and short codes editable and preserves manual
  overrides when a grade template is renamed.
- Blocks section-count reductions when curriculum, legacy requirements, or
  schedule assignments reference the removed section.
- Added focused tests for default grades, stable codes, section labels, and
  deterministic daily period construction.
- Verified lint, strict TypeScript checks, 38 unit/domain/migration tests, and
  the 19-route production build.

### 2026-07-28 - R3 subjects and curriculum matrix

- Replaced the technical subject list with an editable school-owned catalogue,
  an idempotent 16-subject starter set, and custom subject creation.
- Added subject activation and deactivation while retaining historical rows and
  deactivating current curriculum safely.
- Added a grade-by-subject matrix for physical weekly sessions, main-subject
  status, and optional double-session eligibility.
- Applied the approved main-subject defaults for Arabic, English, Mathematics,
  G11 Physics, and G12 LS sciences.
- Added immediate hard-rule feedback for non-main daily limits, disabled
  required doubles, main-subject daily capacity, and total class capacity.
- Displays calculated clock time from the configured uniform session duration
  without changing physical session demand.
- Saves grade curriculum transactionally and materializes it into every active
  class section while preserving later teacher ownership.
- Updated School Setup so sections created after curriculum configuration
  inherit all active grade curriculum immediately.
- Verified formatting, lint, strict TypeScript checks, 43
  unit/domain/migration/UI tests, and the 19-route production build.

### 2026-07-28 - R4 teachers and teaching allocation

- Replaced the legacy teacher list with one-at-a-time teacher entry and editable
  profiles for name, code, full-time/part-time status, exact weekly sessions,
  and optional daily and consecutive hard limits.
- Added a live teaching-assignment board covering every active class-subject.
- Inherits assignment session values from class curriculum so teacher load
  cannot diverge through a separately typed allocation value.
- Displays declared, allocated, remaining, and excessive sessions for every
  teacher while assignments are edited.
- Displays uncovered class-subject totals and exact-load progress immediately.
- Preserves one-teacher ownership structurally through the single
  `ClassCurriculum.teacherId` field and validates every submitted teacher
  against the authenticated school.
- Rejects stale allocation forms transactionally instead of partially applying
  an outdated class-subject list.
- Added shared domain tests for exact, under, and excessive workloads plus a UI
  test for uncovered and excessive states.
- Verified formatting, lint, strict TypeScript checks, 46
  unit/domain/migration/UI tests, and the 19-route production build.

### 2026-07-28 - R5 teacher restrictions

- Replaced unavailable-only checkboxes with one four-state weekly grid:
  Available, Preferred, Avoid, and Unavailable.
- Stores only non-default states as normalized teacher availability rules;
  unavailable is hard while preferred and avoid remain soft.
- Added optional hard daily and consecutive-session limits directly beside the
  selected teacher's grid.
- Validates the complete submitted teaching-slot set against the current
  calendar and rejects stale forms transactionally.
- Displays hard available capacity against the teacher's exact weekly workload
  while restrictions are edited.
- Applies full-time daily balancing or part-time compactness automatically from
  employment type, without exposing raw constraint weights.
- Removed the obsolete unavailable-only write path.
- Added shared capacity and employment-preference tests and expanded the grid UI
  test across hard, soft, break, and shortage states.
- Verified formatting, lint, strict TypeScript checks, 48
  unit/domain/migration/UI tests, and the 19-route production build.

### 2026-07-28 - R6 readiness and solver rules

- Introduced solver snapshot schema version 2 while retaining schema version 1
  parsing, solving, validation, scoring, locks, and regeneration for historical
  schedules.
- Built new snapshots from normalized class curriculum with physical weekly
  sessions, main-subject and optional-double flags, declared teacher workloads,
  and school-week break configuration; rooms are omitted as contracted.
- Added deterministic supervisor readiness checks with stable correction codes
  for incomplete setup, curriculum capacity, teacher ownership, exact workload,
  subject frequency, optional doubles, and teacher hard capacity.
- Enforced non-main daily uniqueness and main-subject adjacent optional doubles
  in CP-SAT, including break-aware adjacency and consecutive-teaching limits.
- Added independent version-2 post-validation for exact demand, daily subject
  frequency, double adjacency, break crossing, and declared teacher totals.
- Added named `FULL_TIME_DAILY_BALANCE` scoring while preserving part-time
  compactness and all legacy scoring behavior.
- Updated the readiness page to use supervisor terminology and direct every new
  blocker to Setup, Subjects, Teachers, or Availability.
- Verified formatting, workspace lint, strict TypeScript and mypy, 52
  TypeScript tests, 14 solver tests, the 19-route production build, and the
  local solver health endpoint.

### 2026-07-28 - R7 simplified application flow

- Replaced thirteen technical primary links with Overview, School setup,
  Curriculum, Teachers, Restrictions, Generate, and Timetables.
- Kept Activity visible as a secondary destination and retained legacy routes
  for historical records without exposing them in the supervisor workflow.
- Added a shared live progress strip to every protected page and a workflow
  overview with one clear Continue action and the latest timetable.
- Added explicit next-step actions from setup through curriculum, teachers,
  restrictions, and generation review.
- Derived completion from normalized records, including curriculum coverage for
  every active class and exact teacher workload matching.
- Added a version-2 draft compatibility boundary that remaps immutable solver
  snapshots to private historical requirement records, preserving editor
  validation, locks, regeneration, export, publication, and activity history.
- Added focused navigation/progress component tests and non-mutating desktop
  and mobile Playwright coverage for the clean-seed R8 gate.
- Verified formatting, workspace lint, strict TypeScript checks, 54 TypeScript
  tests, and the 19-route production build.
- Local Playwright authentication could not run against the modified local
  administrator password; no password or application data was changed for the
  test. R8 will run it against a clean seeded database.

## Phase 0 execution plan

### 0. Prerequisites

Install and verify:

- Git.
- Node.js 24 LTS.
- Corepack with pnpm 10 activated.
- Python 3.12.
- `uv`.
- PostgreSQL 17.

Installed and verified on 2026-07-24: Git 2.55.0, Node.js 24.18.0, pnpm
10.34.5, Python 3.12.10, uv 0.11.32, and PostgreSQL 17.10. Docker Desktop was
installed and then removed at the user's request.

### 1. Repository foundation

1. Initialize Git at the current workspace root.
2. Remove the duplicated extracted blueprint directory after verifying the
   root-level copies, while retaining the source PDF text only as reference or
   moving it under `docs/reference/`.
3. Add `.gitignore`, `.editorconfig`, `.gitattributes`, `.npmrc`,
   `.nvmrc`, `package.json`, `pnpm-workspace.yaml`, and lockfiles.
4. Configure UTF-8, LF normalization, exact package-manager metadata, and Node
   engine constraints.
5. Add `.env.example` containing names and safe local defaults only.

### 2. TypeScript workspace

1. Scaffold `apps/web` with Next.js App Router, TypeScript strict mode,
   Tailwind CSS, ESLint, and the `@/*` import alias.
2. Create `packages/shared` for stable error codes, DTOs, enums, and Zod schemas.
3. Add root scripts that delegate through pnpm workspace filters.
4. Configure Vitest for unit tests and Playwright for later critical flows.
5. Add a minimal web health endpoint at `GET /api/health`. It must report
   application status and database reachability without leaking credentials.
6. Add a minimal page that confirms the application is running; do not add
   scheduling screens in Phase 0.

### 3. Database foundation

1. Add root `prisma/schema.prisma` configured for PostgreSQL and UUID identifiers.
2. Add only the minimum foundation models needed to prove connectivity and
   migrations; Phase 1 owns the scheduling domain schema.
3. Add `prisma/seed.ts` as an idempotent foundation seed entry point.
4. Create and apply the initial migration.
5. Add database client lifecycle handling suitable for Next.js development.
6. Test database health and migration execution against native PostgreSQL.

### 4. Solver foundation

1. Create the Python package under `services/solver`.
2. Configure FastAPI, Pydantic, pytest, Ruff, and mypy in `pyproject.toml`.
3. Add `GET /health`, returning service status and installed OR-Tools version.
4. Add structured exception handling with stable public error codes and no stack
   traces in HTTP responses.
5. Add health endpoint and schema validation tests.
6. Do not implement prechecks, CP-SAT variables, constraints, objectives,
   alternatives, or diagnostics in Phase 0.

### 5. Native local orchestration

- PostgreSQL 17 runs as the automatic Windows service `postgresql-x64-17`.
- Next.js runs through `pnpm dev`.
- FastAPI runs through `pnpm solver:dev`.
- GitHub Actions uses a PostgreSQL service container on its hosted Linux runner.
- The browser never calls the solver directly.

### 6. Quality gates and CI

Configure GitHub Actions with separate jobs:

1. `web-quality`: frozen pnpm install, formatting check, ESLint, TypeScript
   checking, and Vitest.
2. `solver-quality`: locked `uv` sync, Ruff format check, Ruff lint, mypy, and
   pytest.
3. `integration`: start PostgreSQL and solver services, apply migrations, and
   verify both health endpoints.
4. `build`: build the shared package and Next.js production application.

Cache package downloads, not generated build output. Every job must use committed
lockfiles. Playwright is configured in Phase 0, but browser E2E becomes required
when the first user workflow is delivered.

### 7. Documentation and verification

1. Create `README.md` with prerequisites, environment setup, architecture,
   commands, service URLs, testing, and troubleshooting.
2. Keep `AGENTS.md` commands synchronized with actual scripts.
3. Run all Phase 0 checks from a clean dependency install.
4. Verify application and solver health through their native local services.
5. Record exact versions, commands run, results, limitations, and the next task
   in the change log below.

## Planned repository tree

```text
.
|-- .github/
|   `-- workflows/ci.yml
|-- apps/
|   `-- web/
|       |-- src/app/
|       |-- src/lib/
|       |-- tests/
|       `-- package.json
|-- docs/
|   |-- ACCEPTANCE_TESTS.md
|   |-- CODEX_BUILD_TASKS.md
|   |-- DATA_MODEL.md
|   |-- IMPLEMENTATION_STATUS.md
|   |-- PRODUCT_BLUEPRINT.md
|   `-- SOLVER_CONTRACT.md
|-- packages/
|   `-- shared/
|       |-- src/
|       |-- tests/
|       `-- package.json
|-- prisma/
|   |-- migrations/
|   |-- schema.prisma
|   `-- seed.ts
|-- services/
|   `-- solver/
|       |-- app/
|       |-- tests/
|       |-- pyproject.toml
|       `-- uv.lock
|-- .editorconfig
|-- .env.example
|-- .gitattributes
|-- .gitignore
|-- .npmrc
|-- .nvmrc
|-- AGENTS.md
|-- README.md
|-- package.json
|-- playwright.config.ts
|-- pnpm-lock.yaml
|-- pnpm-workspace.yaml
`-- START_HERE.md
```

`apps/worker` is intentionally absent until Phase 5. It will use application
repositories to claim persisted jobs and call the database-independent solver.

## Planned commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm prisma generate
pnpm prisma migrate dev
pnpm prisma db seed
pnpm solver:dev

cd services/solver
uv sync --locked
uv run uvicorn app.main:app --reload --port 8000
uv run pytest
uv run ruff format --check .
uv run ruff check .
uv run mypy app
```

The root `pnpm` quality scripts will include the relevant solver checks so CI and
local development expose one documented quality gate.

## Environment contract

`.env.example` will document:

```text
NODE_ENV=development
APP_URL=http://localhost:3000
AUTH_SECRET=
DATABASE_URL=postgresql://timetable:timetable@localhost:5432/timetable
SOLVER_BASE_URL=http://localhost:8000
SOLVER_INTERNAL_TOKEN=
SOLVER_REQUEST_TIMEOUT_SECONDS=40
LOG_LEVEL=info
```

`AUTH_SECRET`, production database credentials, and `SOLVER_INTERNAL_TOKEN` must
be supplied outside source control. The documented database credentials are
local-development values only.

## Risks and resolved ambiguities

- **Workstation prerequisites:** Git, Node, pnpm, Python, uv, and native
  PostgreSQL are installed and verified. Docker is intentionally absent.
- **Job ownership contradiction:** The blueprint mentioned a Python worker
  polling pending jobs, but also forbids solver database access. The application
  side owns job polling; the Python service remains a pure HTTP solver.
- **Quality score normalization:** The solver contract returns integer penalties,
  while the product discussion mentions a score out of 100. Store and expose raw
  penalties first. Define a stable, profile-aware display normalization in Phase
  4 before showing percentages; never imply that validity is less than 100%.
- **Best penalty of zero:** Alternative quality thresholds cannot be calculated
  only as a percentage of zero. Phase 4 must define an absolute fallback
  tolerance.
- **Alternative diversity:** "Different" currently means at least one assignment
  differs for fixture F. Phase 4 must define a stronger configurable distance for
  production datasets without changing fixture acceptance.
- **Fixed-slot cardinality:** A requirement can have several weekly occurrences.
  Phase 1 must specify whether each fixed slot represents one occurrence and
  reject more fixed slots than `weeklyOccurrences`.
- **Daily minimum semantics:** Teacher minimum lessons per day applies only to
  explicitly selected working days, not automatically to every school day.
- **Calendar shape:** The initial model assumes the named period definitions are
  shared by all working days. Per-day bell schedules are outside MVP unless the
  school confirms they are required before Phase 1.
- **Authentication:** Phase 1 will use Auth.js with one seeded administrator and
  database-backed sessions. Public registration and password recovery are out of
  scope.
- **Performance:** The 5-second and 30-second targets apply only to named fixtures
  on recorded hardware. They are not universal guarantees.
- **Version drift:** Task 1 must record actual pinned versions after dependency
  resolution. Node 24 LTS satisfies current Next.js and Prisma runtime
  requirements; Python 3.12 is selected conservatively for binary-package
  compatibility.

## Phase checklist

### Phase 0 - foundation

- [x] Monorepo initialized
- [x] Next.js app
- [x] Solver service
- [x] PostgreSQL and Prisma
- [x] Native local services (Docker removed by user decision)
- [x] CI
- [x] README
- [x] Health checks

### Phase 1 - CRUD

- [x] Authentication
- [x] Calendar setup
- [x] Teachers
- [x] Subjects
- [x] Classes
- [x] Rooms
- [x] Teaching requirements
- [x] Availability

### Phase 2 - prechecks and snapshots

- [x] Readiness validation
- [x] Canonical snapshot
- [x] SHA-256 fingerprint
- [x] Validation UI

### Phase 3 - hard solver

- [x] Exact counts
- [x] Teacher collisions
- [x] Class collisions
- [x] Room collisions
- [x] Availability
- [x] Duration
- [x] Fixed and forbidden slots
- [x] Post-solve validator

### Phase 4 - optimization

- [x] Soft constraints
- [x] Penalty breakdown
- [x] Profiles
- [x] Alternatives
- [x] Benchmarks

### Phase 5 - application integration

- [x] Generation jobs
- [x] Alternative persistence
- [x] Timetable views
- [x] Comparison

### Phase 6 - editing

- [x] Move
- [x] Swap
- [x] Lock
- [x] Undo and redo
- [x] Partial regeneration

### Phase 7 - hardening

- [x] Diagnostics
- [x] CSV
- [x] Print
- [x] Audit
- [x] Publishing
- [x] Security review
- [x] End-to-end suite
- [x] Deployment guide

## Change log

### 2026-07-24 - Task 0 planning

- Read all blueprint documents and preserved the single-school MVP.
- Defined the Phase 0 repository tree, runtime baselines, package managers,
  commands, Compose services, environment variables, test tooling, and CI jobs.
- Resolved generation-job ownership without allowing the solver to query the
  database.
- Recorded missing local prerequisites and product-contract ambiguities.
- Next task: Task 1, repository foundation. Do not implement scheduling features.

### 2026-07-24 - Task 1 repository foundation

- Installed and verified the native Git, Node.js, pnpm, Python, uv, and
  PostgreSQL toolchain.
- Removed Docker Desktop and adopted native local services to reduce laptop
  resource use.
- Initialized Git and the pnpm monorepo.
- Added Next.js 16.2.11, Prisma 7.9.0, PostgreSQL 17.10, FastAPI 0.139.2, and
  OR-Tools 9.15.6755 foundations.
- Created and applied the `foundation` Prisma migration.
- Added database-aware web health and OR-Tools-aware solver health endpoints.
- Added shared TypeScript contracts, unit tests, solver tests, a Chrome browser
  smoke test, and GitHub Actions CI.
- Verified formatting, linting, TypeScript checks, strict Python typing, unit
  tests, solver tests, production build, both live health endpoints, and the
  Playwright smoke test.
- Pinned patched transitive releases for `sharp`, `postcss`, and `find-my-way`;
  the final production dependency audit reports no known vulnerabilities.
- Known limitation: the sandboxed Vitest process cannot traverse a protected
  Windows parent directory; the same test suite passes under the normal user
  context and in CI.
- Next task: Task 2, Phase 1 domain model. Do not build scheduling or CRUD UI
  behavior in that task.

### 2026-07-24 - Task 2 domain model

- Replaced the foundation-only schema with normalized school, user, term,
  calendar, teacher, subject, class, room, availability, teaching requirement,
  constraint, generation, schedule, assignment, and audit models.
- Added compound school and term foreign keys, short-code uniqueness, soft
  deletion fields, job-status indexes, immutable generation snapshots, schedule
  ancestry, and published-version protection.
- Added PostgreSQL checks for term dates, calendar indices, period times,
  workloads, capacities, requirement counts, constraint weights, generation
  metrics, schedule publishing, and assignment positions.
- Created and applied migration `20260724133435_phase1_domain`.
- Added an idempotent Cedars Secondary School seed with one active term, five
  working days, 25 physical slots including breaks, three teachers, four
  subjects, two classes, a laboratory, six teaching requirements, part-time
  availability, and a balanced constraint profile.
- Verified the seed twice with stable counts: 1 school, 1 term, 3 teachers, 2
  classes, 6 requirements, and 25 slots.
- Added school-scoped repository factories and explicit cross-school access
  rejection.
- Added 12 focused tests covering calendar slot construction, availability
  uniqueness, weekly occurrence and duration semantics, fixed-slot cardinality,
  schedule immutability, derived versions, and school authorization.
- Next task: Task 3, administrator authentication and setup UI. Do not implement
  solver behavior during that task.

### 2026-07-24 - Task 3 administrator setup

- Added password-based administrator authentication with bcrypt hashes, signed
  eight-hour HTTP-only sessions, protected layouts, and school-scoped session
  verification for every setup mutation.
- Built responsive setup navigation and pages for the active-term calendar,
  teachers, subjects, classes, optional rooms, teaching requirements, and
  teacher availability.
- Added validated server actions, scoped reference checks, reusable tables,
  reusable form controls, a weekly availability grid, and loading, empty, and
  route error states.
- Added a focused weekly-grid component test and a Playwright workflow covering
  administrator sign-in and teacher creation.
- Verified linting, TypeScript, unit tests, the production build, and the
  authenticated Playwright workflow.
- Next task: Task 4, deterministic readiness validation and canonical solver
  snapshots. Do not start solver jobs for invalid input.

### 2026-07-25 - Task 4 readiness validation

- Added a versioned immutable solver snapshot contract covering the active
  calendar, resources, requirements, availability, fixed slots, forbidden
  slots, locked assignments, constraint weights, and generation options.
- Added canonical recursive object-key ordering and deterministic SHA-256 input
  fingerprints.
- Implemented deterministic class, teacher, requirement, daily, distinct-day,
  room, fixed-collision, consecutive-slot, and locked-assignment prechecks.
- Added stable issue codes, related entity IDs, required and available values,
  human-readable summaries, and corrective suggestions.
- Added readable JSON acceptance fixtures B, C, D, and E and integration tests
  for teacher capacity, fixed teacher collision, double-period capacity, and
  fixed room collision.
- Built a protected readiness checklist showing blocking diagnostics, setup
  links, input counts, schema version, and snapshot fingerprint.
- Confirmed invalid data stops at readiness; this phase creates no generation
  job and makes no solver request.
- Verified formatting, linting, strict TypeScript, 22 unit/component tests, the
  production build, and the authenticated Playwright workflow.
- Next task: Task 5, hard-constraint CP-SAT solver and application integration.

### 2026-07-25 - Task 5 hard-constraint solver

- Added strict Pydantic schema-version-1 contracts for `/v1/solve` and
  `/v1/validate`, with camel-case JSON aliases and unknown-field rejection.
- Implemented CP-SAT decision variables over precomputed compatible
  requirement-occurrence, start-slot, and room choices.
- Enforced exact weekly demand, teacher/class/room collisions, unavailable
  slots, duration continuity, fixed and forbidden positions, locked
  assignments, daily occurrence limits, minimum distinct days, teacher and
  class daily workloads, teacher consecutive-load limits, and room
  compatibility.
- Added an independent post-solve validator; a solver result is never returned
  as feasible when this validation reports a hard-rule violation.
- Added readable acceptance Fixture A with five days, two classes, three
  teachers, ten requirements, and part-time first-period unavailability.
- Added direct solver, solve API, and validate API tests covering exact demand,
  zero hard violations, availability, fingerprints, metadata, and collision
  rejection.
- Connected readiness to synchronous generation with server-side revalidation,
  immutable job snapshots, fingerprint verification, transactional alternative
  and diagnostic persistence, failure recording, and a protected result page.
- Extended Playwright through login, setup, readiness, live CP-SAT generation,
  persistence, and result rendering.
- Verified formatting, linting, strict TypeScript and mypy, 22 TypeScript tests,
  four Python tests, production build, and the live end-to-end workflow.
- Next task: Task 6, named soft-constraint penalties and configurable weights.

### 2026-07-25 - Task 6 soft constraints

- Added nine named, configurable soft constraints for teacher slot
  preferences, edge periods, teacher gaps, part-time compactness, compact
  teaching blocks, subject spread, repeated subjects, subject time bands, and
  daily workload balance.
- Extended solver snapshots with teacher employment type and subject time-band
  and consecutive-period preference metadata.
- Added a weighted CP-SAT minimization objective using the active constraint
  profile; zero disables a term.
- Added an independent assignment scorer and fail-closed verification that the
  named breakdown exactly sums to both the reported total and solver objective.
- Added readable acceptance Fixtures I and J for subject spread and part-time
  compactness comparisons.
- Added an administrator quality-weight settings page and persisted named
  penalty breakdowns on generation results.
- Documented every formula and default weight in `docs/SOFT_CONSTRAINTS.md`.
- Verified the weighted live generation workflow and result UI.
- Next task: Task 7, quality-bounded diverse alternatives.

### 2026-07-25 - Task 7 alternatives

- Added configurable generation of one to five alternatives and a 0-100%
  maximum quality-degradation ceiling.
- Kept rank 1 as the best weighted solution, then excluded prior assignment
  patterns and maximized occurrence-level differences against all earlier
  alternatives.
- Enforced the quality ceiling as a hard CP-SAT constraint for every later
  solve and independently revalidated hard feasibility and penalty totals.
- Added diversity scores and early-stop warnings when the requested number of
  distinct quality-bounded alternatives does not exist.
- Added readable acceptance Fixture F with pairwise-difference and quality-bound
  assertions.
- Persisted all alternatives, quality scores, diversity scores, breakdowns,
  runtimes, assignments, and warnings.
- Added generation controls and a protected comparison interface for switching
  among alternative ranks.
- Documented the algorithm in `docs/ALTERNATIVE_GENERATION.md`.
- Verified a live three-alternative run with quality/diversity pairs `141/0`,
  `167/17`, and `164/34`, all within the configured 20% quality ceiling.
- Next task: Task 8, whole-school and resource timetable views.

### 2026-07-25 - Task 8 timetable views and editor

- Added whole-school, class, teacher, and optional room weekly timetable views
  with stable desktop-first grids and resource filters.
- Added opening immutable generated alternatives as versioned draft schedules.
- Added move score previews, drag-and-drop, swaps, an unassigned tray, and
  assignment lock and unlock controls.
- Validated candidate edits through the solver before database writes; invalid
  edits are rejected atomically with stable hard-constraint codes.
- Preserved every accepted edit as a derived draft version with audit details,
  score differences, and undo and redo navigation.
- Added nullable assignment positions with a database pair constraint for the
  unassigned tray.
- Added readable acceptance Fixture H for manual-move collision rejection.
- Extended the authenticated Playwright workflow through draft creation,
  resource views, atomic rejection, lock, undo, and redo.
- Verified linting, strict TypeScript and mypy, 22 TypeScript tests, seven Python
  tests, the production build, and the live end-to-end workflow.
- Next task: Task 9, partial regeneration around locked and manually positioned
  assignments.

### 2026-07-26 - Task 9 partial regeneration

- Extended solver snapshots with existing draft placements while retaining
  locked assignments as exact hard constraints.
- Added CP-SAT placement hints and a one-unit movement penalty for each changed
  unlocked assignment.
- Added explicit `movementPenalty` and `movedAssignments` response fields,
  separate from named timetable-quality penalties.
- Added draft regeneration that persists a new generation job, immutable
  alternative, derived schedule version, regenerated assignments, response
  metadata, and audit event in one transaction.
- Added an application-side lock-preservation check before regenerated results
  can be persisted.
- Added a regeneration result summary with moved and preserved-lock counts.
- Added readable Fixture G and proved three locked assignments remain fixed,
  hard validation passes, and a forced unlocked move is reported.
- Extended Playwright through three locks, regeneration, lock preservation,
  derived version history, and undo availability.
- Verified formatting, linting, strict TypeScript and mypy, 22 TypeScript tests,
  eight Python tests, the production build, and the live end-to-end workflow.
- Next task: Task 10, infeasibility diagnostics, publishing, CSV and print
  exports, security hardening, and deployment documentation.

### 2026-07-26 - Task 10 release hardening

- Added deterministic infeasibility diagnostics for empty assignment domains
  and conflicting locks, followed by a separate minimum-collision relaxation
  model for grouped resource diagnostics.
- Kept diagnostic relaxation output separate from selectable alternatives.
- Added fully validated publication with automatic archival of the previous
  published term version and immutable published schedules.
- Added UTF-8 CSV export with spreadsheet-formula neutralization and printable
  timetable views.
- Added a protected activity page and generation/publication audit events,
  complementing existing edit, lock, and regeneration events.
- Added 1 MB web action limits, 5 MB solver limits, optional internal solver
  authentication, request timeouts, and browser security response headers.
- Extended Playwright through CSV export, printable teacher view, publication,
  immutable controls, and audit visibility; added the workflow to CI.
- Added measured fixture benchmarks for the development ThinkPad and a
  production deployment, backup, secrets, migration, and verification guide.
- Updated security overrides to patched PostCSS 8.5.18 and Valibot 1.4.2; the
  production dependency audit reports no known vulnerabilities.
- Verified formatting, linting, strict TypeScript and mypy, 22 TypeScript tests,
  11 Python tests, a 19-route production build, and the complete live
  end-to-end release workflow.
- Remaining work is post-MVP: multi-school operation, teacher accounts, billing,
  attendance, and other explicitly excluded product areas.
