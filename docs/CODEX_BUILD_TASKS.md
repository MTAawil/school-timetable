# Codex Build Tasks

Run these tasks sequentially. Review each diff and test result before starting the next task. Do not ask Codex to build the entire product in one undifferentiated request.

## Task 0 — inspect and plan

```text
Read AGENTS.md and every file in docs/. Do not write production code yet.

Produce a concrete Phase 0 execution plan in docs/IMPLEMENTATION_STATUS.md. Resolve package layout, scripts, Docker services, environment variables, test runners, and CI steps. Preserve the architecture and non-goals in PRODUCT_BLUEPRINT.md. Identify risks or contradictions, but do not expand scope.

Then summarize the planned file tree and commands.
```

## Task 1 — repository foundation

```text
Implement Phase 0 from docs/PRODUCT_BLUEPRINT.md and the approved plan.

Create the pnpm monorepo, Next.js TypeScript app, Python FastAPI solver service, PostgreSQL/Prisma foundation, Docker Compose, health endpoints, formatting, linting, type checking, unit test runners, and CI. Add a small shared error-code package. Do not implement scheduling features yet.

Run all available checks. Update README.md and docs/IMPLEMENTATION_STATUS.md with exact commands, completed work, and limitations.
```

## Task 2 — domain model

```text
Implement the Phase 1 database schema and migrations for the domain described in docs/DATA_MODEL.md. Add seed data for one sample school and term. Build server-side repositories/services with school-scoped authorization boundaries.

Add unit tests for calendar slots, availability uniqueness, teaching requirement duration semantics, and schedule versioning. Do not build the solver yet.

Run migrations and tests. Update docs/IMPLEMENTATION_STATUS.md.
```

## Task 3 — setup user interface

```text
Build the administrator setup workflow for calendar, teachers, subjects, classes, rooms, teaching requirements, and availability.

Use reusable validated forms and a reusable weekly availability grid. Include loading, empty, validation, and error states. Keep business rules in services, not React components. Rooms must be globally disableable for the term.

Add focused component/integration tests and one Playwright happy-path setup test. Update documentation and status.
```

## Task 4 — readiness validation

```text
Implement Phase 2 deterministic feasibility prechecks from PRODUCT_BLUEPRINT.md. Each issue must have a stable code, summary, related entity IDs, required/available values where applicable, and suggested actions.

Implement canonical solver snapshot generation and SHA-256 fingerprinting. Add fixtures B, C, D, and E from ACCEPTANCE_TESTS.md. Ensure impossible datasets do not start a solver job.

Build the readiness checklist UI. Run tests and update status.
```

## Task 5 — hard-constraint solver

```text
Implement the solver API contract and Phase 3 CP-SAT model.

Start with fixture A. Implement exact weekly demand, teacher collision, class collision, optional room collision, availability, duration continuity, fixed assignments, forbidden starts, daily limits, distinct days, and room compatibility. Precompute compatible starts. Add independent post-solve validation.

Return one valid alternative with structured status and metadata. Do not implement soft constraints or diversity yet.

Run pytest, API contract tests, and application integration tests. Update status.
```

## Task 6 — soft constraints

```text
Implement named soft-constraint penalty terms and configurable weights. Start with teacher disliked/preferred slots, first/last-period preferences, teacher gaps, part-time compactness, consecutive-load preference, subject spread, repeated subject in a day, late heavy subjects, and daily workload balance.

Ensure penalty breakdown exactly sums to total penalty. Add fixtures I and J. Document every penalty formula and its default weight. Run tests and update status.
```

## Task 7 — alternatives

```text
Implement generation of up to five diverse alternatives. Prefer quality first, then diversity. Add a configurable maximum quality degradation from the best known solution.

Implement fixture F and verify that alternatives differ and remain hard-feasible. Persist job, input snapshot, fingerprint, alternatives, penalty breakdown, runtime, and warnings. Build the generation status and comparison UI.

Run all relevant checks and update status.
```

## Task 8 — timetable views and editor

```text
Build whole-school, class, teacher, and optional room timetable views. Implement a desktop-first editor with move, swap, unassigned tray, hard-constraint validation, score-difference preview, lock/unlock, and undo/redo.

An invalid edit must be rejected atomically with an exact stable error code. Add fixture H and end-to-end coverage. Update status.
```

## Task 9 — regeneration

```text
Implement regeneration from an edited draft.

Locked assignments are hard constraints. Existing unlocked assignments are solver hints and may receive movement penalties. Report assignments that moved. Add fixture G and prove all locked assignments remain fixed.

Create a new derived schedule version rather than mutating a published schedule. Run tests and update status.
```

## Task 10 — diagnostics and release hardening

```text
Implement infeasibility diagnostics using deterministic checks first, then grouped CP-SAT assumptions or a diagnostic relaxation model. Never return a relaxed diagnostic result as a valid timetable.

Add CSV and print exports, audit events, security checks, payload limits, timeouts, complete end-to-end flows, and deployment documentation. Benchmark the named fixtures and report dataset sizes and hardware rather than making universal speed claims.

Run the full quality gate. Update README and implementation status with remaining post-MVP work.
```
