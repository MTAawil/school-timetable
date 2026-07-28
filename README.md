# School Timetable

A single-school weekly timetable application. The repository separates the
Next.js administration application from the database-independent Python
optimization service.

For a non-technical explanation of what the software does and how a school uses
it, read [`USER_GUIDE.md`](USER_GUIDE.md).

## Supervisor Workflow Redesign

This is the active implementation plan for branch
`feature/supervisor-workflow-redesign`.

Codex must read this section before starting redesign work. Tasks are completed
in order. Do not begin a later task while an earlier task is incomplete unless
the plan is explicitly revised and documented here.

The stable original MVP remains on `main`. The redesign branch is merged only
after the complete workflow passes automated tests and supervisor review.

The detailed plain-language contract is in
[`docs/SUPERVISOR_WORKFLOW.md`](docs/SUPERVISOR_WORKFLOW.md).

### Confirmed Product Rules

- Every school day uses the same session structure.
- There is one configurable break per day.
- All teaching sessions have the same duration.
- The application starts with editable grade templates: KG1, KG2, KG3, G1
  through G11, G12 LS, G12 ES, and G12 GS.
- The supervisor chooses how many sections each grade has.
- Grade curriculum settings are copied to every section of that grade.
- The application provides editable common subjects and allows additional
  subjects.
- Curriculum is entered as required sessions per week for every grade-subject
  combination.
- Each class-subject combination is taught by exactly one teacher.
- Each teacher has an exact declared weekly teaching workload.
- The teacher's allocated class-subject sessions must exactly equal that
  workload.
- Non-main subjects may appear at most once per class per day.
- Main subjects may use an optional double session when useful.
- A main subject may occupy at most two consecutive sessions.
- Full-time teacher workloads should be balanced across the week.
- Part-time teacher workloads should preferably be compact and follow their
  availability.
- Hard restrictions can never be violated.
- Soft preferences may be violated with a visible penalty when necessary.
- Rooms are hidden from the normal redesign workflow.

### Target Navigation

The redesign replaces the technical setup navigation with:

1. School Setup
2. Teachers
3. Restrictions
4. Generate
5. Timetables
6. Activity

Advanced configuration must not appear in the primary workflow unless the
supervisor needs it.

### Redesign Tasks

#### R0 - Product Contract and Acceptance Tests

Status: **Complete**

- [x] Document the complete supervisor workflow in plain language.
- [x] Define grade-template and section naming behavior.
- [x] Define the default editable subject catalogue.
- [x] Define the curriculum matrix and main-subject behavior.
- [x] Define exact teacher workload and allocation rules.
- [x] Define hard restrictions and soft preferences.
- [x] Define readiness errors and stable codes.
- [x] Add acceptance fixtures for the redesigned rules.
- [x] Update `docs/DATA_MODEL.md`, `docs/SOLVER_CONTRACT.md`, and
      `docs/ACCEPTANCE_TESTS.md`.
- [x] Review the contract with the supervisor before schema or UI changes.

Completion rule: every confirmed rule has an example and an acceptance test;
there are no unresolved scheduling meanings hidden in implementation code.

#### R1 - Isolated Database and Domain Migration

Status: **Complete**

- [x] Create and use a separate local `timetable_redesign` database.
- [x] Add normalized grade, curriculum, and teacher-allocation structures.
- [x] Add exact weekly workload fields and database checks.
- [x] Enforce one teacher per class-subject.
- [x] Represent grade-specific main-subject and optional-double eligibility.
- [x] Create a new Prisma migration; never edit an applied migration.
- [x] Add domain and migration tests.

Completion rule: the new domain can represent the confirmed workflow without
JSON substitutes for core entities, and the stable MVP database remains
untouched.

#### R2 - School Setup Workflow

Status: **Complete**

- [x] Build one guided school-week setup.
- [x] Configure working days, sessions per day, session duration, and one break.
- [x] Show editable grade templates.
- [x] Let the supervisor select section counts.
- [x] Generate predictable section names such as G7-A and G7-B.
- [x] Allow generated section names to be edited.

Completion rule: a supervisor can create the complete school week and all
classes without visiting technical entity pages.

#### R3 - Subjects and Curriculum Matrix

Status: **Complete**

- [x] Provide an editable default subject catalogue.
- [x] Allow custom subjects.
- [x] Build the grade-by-subject weekly-session matrix.
- [x] Configure whether each grade-subject is main.
- [x] Configure optional double-session eligibility.
- [x] Copy grade curriculum requirements to every generated section.
- [x] Display calculated teaching hours from session duration.

Completion rule: every class has an explicit weekly curriculum, and the UI
shows missing or impossible curriculum values immediately.

#### R4 - Teacher and Teaching Allocation Workflow

Status: **Complete**

- [x] Add teachers one at a time.
- [x] Record full-time or part-time status.
- [x] Record exact weekly teaching sessions.
- [x] Allocate one teacher to each class-subject.
- [x] Show allocated, required, remaining, and excessive teacher load.
- [x] Show uncovered and over-allocated class curriculum.
- [x] Prevent ambiguous shared ownership of a class-subject.

Completion rule: teacher totals exactly match declared workloads and every
class-subject is owned by exactly one teacher before generation.

#### R5 - Teacher Restrictions

Status: **Complete**

- [x] Build a simple weekly restriction grid.
- [x] Support hard unavailable periods.
- [x] Support preferred and avoid-if-possible periods.
- [x] Configure maximum consecutive teaching sessions.
- [x] Configure an optional hard daily maximum.
- [x] Add soft weekly workload balancing for full-time teachers.
- [x] Add compactness preferences for part-time teachers.

Completion rule: the supervisor can understand and enter restrictions without
editing raw constraint records or weights.

#### R6 - Readiness and Solver Rules

Status: **Complete**

- [x] Validate exact teacher workload totals.
- [x] Validate complete class curriculum coverage.
- [x] Validate one teacher per class-subject.
- [x] Reject impossible non-main subject frequency.
- [x] Enforce at most one non-main subject session per class per day.
- [x] Allow optional main-subject doubles with at most two consecutive sessions.
- [x] Balance full-time teacher workloads with a soft penalty.
- [x] Keep part-time schedules compact where possible.
- [x] Preserve every existing collision, availability, locking, regeneration,
      and post-solve validation guarantee.
- [x] Add focused solver fixtures and tests for every changed rule.

Completion rule: readiness stops deterministic failures, the solver never
weakens a hard rule, and every returned schedule passes independent validation.

#### R7 - Simplified Application Flow

Status: **Not started**

- [ ] Replace the large technical sidebar with the target navigation.
- [ ] Add a clear progress state across setup steps.
- [ ] Connect setup, teachers, restrictions, readiness, and generation.
- [ ] Preserve timetable alternatives, editing, locks, regeneration, export,
      publication, and activity history.
- [ ] Remove or hide superseded setup screens only after replacements work.

Completion rule: a first-time supervisor can reach timetable generation without
needing to understand the internal data model.

#### R8 - Migration, End-to-End Verification, and Approval

Status: **Not started**

- [ ] Test a completely empty school setup.
- [ ] Test migration or explicit conversion of existing supported data.
- [ ] Add a complete supervisor Playwright workflow.
- [ ] Run formatting, lint, types, unit, solver, integration, build, and E2E
      gates.
- [ ] Update the plain-language user guide and deployment documentation.
- [ ] Deploy the branch locally for supervisor manual testing.
- [ ] Record supervisor approval before merging to `main`.

Completion rule: the redesign is verified from empty setup through publication,
and the supervisor approves the workflow.

### Working Status

- Current branch: `feature/supervisor-workflow-redesign`
- Current task: **R7 - Simplified Application Flow**
- Last completed task: **R6 - Readiness and Solver Rules**
- Stable MVP branch: `main`

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
postgresql://timetable:timetable@localhost:5432/timetable_redesign
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
- Deterministic and relaxation-based infeasibility diagnostics
- Validated publication, CSV export, printable resource views, and activity log
- Payload limits, request timeouts, internal solver authentication, and
  security response headers
- Shared validation and error-code package
- Unit, component, solver, and authenticated browser tests with GitHub Actions CI

Not implemented yet:

- None for the agreed single-school MVP. Multi-school operation, teacher
  accounts, billing, and attendance remain post-MVP.

See `docs/IMPLEMENTATION_STATUS.md` for delivery status,
`docs/DEPLOYMENT.md` for release operations, and `docs/BENCHMARKS.md` for
measured fixture performance.
