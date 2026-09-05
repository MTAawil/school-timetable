# School Timetable Generator — Product and Engineering Blueprint

## 1. Product objective

Build a web application that allows a school administrator to:

1. Define the school week, teaching periods, breaks, teachers, classes, subjects, rooms, and weekly teaching requirements.
2. Record teacher and class availability and other restrictions.
3. Check whether the entered requirements are obviously impossible.
4. Generate multiple valid weekly timetable alternatives.
5. Optimize valid timetables according to school preferences.
6. Explain conflicts when no complete valid timetable can be found.
7. Manually adjust the timetable, lock selected lessons, and regenerate only the unlocked portion.
8. Print or export the final timetable by class and by teacher.

The first release is for one school. Do not build multi-tenant billing, public registration, parent portals, attendance, payroll, or substitute-teacher management in the MVP.

---

## 2. Product principle

The software must distinguish between:

### Hard constraints
Rules that can never be violated.

Examples:

- A teacher cannot teach two classes in the same slot.
- A class cannot receive two lessons in the same slot.
- A teacher cannot be scheduled while unavailable.
- A required number of weekly lessons must be assigned.
- A locked lesson cannot be moved.
- A special room cannot host two lessons simultaneously.
- Break periods cannot contain lessons.
- A teacher cannot have more than two internal free teaching sessions between
  their first and last lesson on a day.

### Soft constraints
Preferences that can be violated at a measurable cost.

Examples:

- Avoid first period for a teacher.
- Minimize teacher gaps within the hard daily maximum.
- Avoid more than three consecutive lessons.
- Spread a subject across different days.
- Prefer mathematics and science earlier in the day.
- Avoid a single lesson between two free periods.
- Prefer part-time teachers' lessons to be compact.

The solver must first satisfy all hard constraints and then minimize the weighted penalties from soft constraints. It must never silently convert a hard constraint into a soft one.

---

## 3. Target users

### School administrator / scheduler
Can manage all data, run validation, generate schedules, compare alternatives, manually edit, lock, regenerate, and publish.

### Teacher viewer — post-MVP
Can view only their personal timetable.

For the MVP, implement one authenticated administrator role. Structure authorization so a teacher role can be added later.

---

## 4. Recommended technical architecture

### Monorepo

```text
school-timetable/
├── AGENTS.md
├── README.md
├── docker-compose.yml
├── pnpm-workspace.yaml
├── apps/
│   └── web/                    # Next.js + TypeScript
├── services/
│   └── solver/                 # Python FastAPI + Google OR-Tools CP-SAT
├── packages/
│   └── shared/                 # Shared TypeScript DTOs, enums, Zod schemas
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── docs/
    ├── PRODUCT_BLUEPRINT.md
    ├── DATA_MODEL.md
    ├── SOLVER_CONTRACT.md
    ├── ACCEPTANCE_TESTS.md
    └── IMPLEMENTATION_STATUS.md
```

### Components

- **Frontend and application API:** Next.js App Router, TypeScript, Tailwind CSS, and an accessible component library.
- **Database:** PostgreSQL.
- **ORM and migrations:** Prisma ORM.
- **Solver service:** Python, FastAPI, Pydantic, and Google OR-Tools CP-SAT.
- **Local development:** Docker Compose for PostgreSQL and the solver.
- **Testing:** Vitest or Jest for TypeScript, Playwright for critical UI flows, and pytest for the solver.
- **Authentication:** A simple administrator login using Auth.js or an equivalent maintained solution.
- **Background generation:** For the MVP, persist a `GenerationJob` row and let the Python worker process pending jobs. The web UI polls job status. Avoid adding Redis until the actual load requires it.

### Why separate the solver

The web application owns users, CRUD, validation, persistence, editing, and presentation. The solver service receives an immutable JSON snapshot, solves it, and returns alternatives and diagnostics. This makes the solver independently testable and prevents UI code from becoming coupled to optimization logic.

---

## 5. MVP scope

### 5.1 School calendar settings

The administrator can configure:

- School name.
- Active academic term.
- Working days, such as Monday through Friday or Monday through Saturday.
- Number and names of periods per day.
- Period start and end times.
- Break periods.
- Optional non-teaching assembly periods.

A slot is uniquely identified by `(dayIndex, periodIndex)`.

### 5.2 Teachers

Teacher fields:

- Name.
- Short code.
- Active status.
- Employment type: full-time or part-time.
- Minimum and maximum lessons per day.
- Maximum consecutive lessons.
- Optional maximum weekly workload.
- Availability grid.
- Preferred and disliked slots.
- Optional preferred free day.
- Notes.

Availability states:

- `AVAILABLE`
- `PREFERRED`
- `DISLIKED`
- `UNAVAILABLE`

Only `UNAVAILABLE` is a hard prohibition by default. The other states affect the objective score.

### 5.3 Subjects

Subject fields:

- Name.
- Short code.
- Category.
- Preferred time band: early, neutral, or late.
- Default room type.
- Default maximum sessions per class per day.
- Whether consecutive double periods are allowed or preferred.

### 5.4 Classes and sections

Fields:

- Grade.
- Section name, such as 10-A.
- Short code.
- Homeroom teacher, optional.
- Availability grid.
- Maximum lessons per day.
- Optional fixed homeroom or room.

### 5.5 Rooms

Room fields:

- Name.
- Type, such as standard classroom, laboratory, computer lab, gym.
- Availability grid.
- Capacity, optional.
- Active status.

Rooms are optional for schools that do not need room scheduling. The application must support a setting that disables room constraints.

### 5.6 Teaching requirements

A `TeachingRequirement` describes what must appear in the weekly timetable.

Required fields:

- Class section.
- Subject.
- Teacher.
- Weekly session count.
- Session duration in periods: normally 1; may be 2 for laboratories.
- Minimum and maximum sessions per day.
- Minimum number of distinct teaching days.
- Whether multiple sessions on the same day are allowed.
- Required room or room type, optional.
- Fixed slots, optional.
- Forbidden slots, optional.
- Notes.

Examples:

- Grade 12-A, Mathematics, Teacher Ahmad, 5 periods per week.
- Grade 11-B, Physics Lab, Teacher Rami, 2 sessions per week, each session is 2 consecutive periods, laboratory required.

### 5.7 Constraint settings

The administrator can enable and assign weights to soft constraints.

Initial configurable preferences:

- Teacher preferred slots.
- Teacher disliked slots.
- Avoid first period.
- Avoid last period.
- Minimize teacher gaps.
- Minimize class gaps.
- Limit teacher consecutive lessons.
- Spread a subject across the week.
- Avoid repeating the same subject twice in one day.
- Prefer selected subjects earlier.
- Compact part-time teacher schedules.
- Balance daily workloads.

Use a clear label showing whether each rule is hard or soft. Hard rules do not have adjustable penalty weights.

### 5.8 Feasibility check

Before starting the expensive solve, perform deterministic checks and display actionable errors.

Minimum prechecks:

1. A class requires more weekly periods than its available teaching slots.
2. A teacher's assigned weekly workload exceeds the teacher's available slots.
3. A teaching requirement has fewer compatible slots than its required session count.
4. Required sessions exceed `maximumPerDay × availableDays`.
5. Required distinct days exceed compatible days.
6. A required room or room type has insufficient compatible capacity.
7. Two fixed lessons collide for a teacher, class, or room.
8. A double-period requirement has too few consecutive available slot pairs.
9. Locked assignments conflict with current availability.
10. A teacher has conflicting requirements at the same fixed slot.

Each error must contain:

- A stable machine-readable code.
- Human-readable summary.
- Related entity IDs and names.
- Required capacity versus available capacity where relevant.
- Suggested actions.

### 5.9 Schedule generation

Generation options:

- Number of alternatives: default 3, maximum 5.
- Time limit per alternative: configurable, with a sensible default.
- Random seed.
- Optimization profile: balanced, teacher-friendly, student-friendly.
- Use existing schedule as a hint, optional.
- Preserve locked assignments.

Generation statuses:

- `QUEUED`
- `RUNNING`
- `FEASIBLE`
- `OPTIMAL`
- `INFEASIBLE`
- `FAILED`
- `CANCELLED`

Each returned alternative contains:

- Assignment list.
- Solver status.
- Total penalty score.
- Penalty breakdown by soft constraint.
- Runtime.
- Warnings.
- Deterministic fingerprint of the input snapshot.

### 5.10 Timetable views

Provide:

- Whole-school timetable.
- Per-class timetable.
- Per-teacher timetable.
- Per-room timetable when rooms are enabled.
- Alternative comparison view.
- Conflict and warning panel.

### 5.11 Manual editing

The administrator can:

- Drag a lesson to another slot.
- Swap two lessons.
- Remove an assignment to an unassigned tray.
- Lock or unlock an assignment.
- Validate every edit immediately.
- Undo and redo recent changes.
- Regenerate only unlocked assignments.

A manual edit that violates a hard constraint must be rejected with an exact explanation. A soft-constraint degradation may be allowed after showing the score difference.

### 5.12 Publishing and export

MVP:

- Mark one schedule version as published.
- Print-friendly class timetable.
- Print-friendly teacher timetable.
- CSV export.

Post-MVP:

- Styled Excel workbook.
- PDF export.
- Teacher portal.
- Notifications.

---

## 6. Data model

The exact Prisma schema may evolve, but preserve these domain concepts.

### Core entities

- `User`
- `School`
- `AcademicTerm`
- `DayDefinition`
- `PeriodDefinition`
- `Slot`
- `Teacher`
- `Subject`
- `ClassSection`
- `Room`
- `AvailabilityRule`
- `TeachingRequirement`
- `RequirementForbiddenSlot`
- `RequirementFixedSlot`
- `ConstraintProfile`
- `ConstraintWeight`
- `Schedule`
- `ScheduleAssignment`
- `GenerationJob`
- `GenerationAlternative`
- `GenerationDiagnostic`
- `AuditLog`

### Important relationships

- A school has many terms.
- A term has day and period definitions.
- Teachers, classes, rooms, subjects, and requirements belong to a school and term where appropriate.
- A requirement links exactly one class, subject, and teacher.
- A schedule belongs to one term and one immutable generation input snapshot.
- A schedule has many assignments.
- An assignment links a requirement to a starting slot and optional room.
- An assignment records duration and lock state.
- Generation alternatives are immutable. Manual editing creates a new schedule version or a derived draft.

### Recommended database rules

- Use UUIDs.
- Use `createdAt`, `updatedAt`, and optional `deletedAt`.
- Prefer soft deletion for domain entities already referenced by schedules.
- Add unique constraints for short codes within a school.
- Add database indexes on foreign keys and generation job status.
- Store the solver request snapshot and response metadata as JSONB for reproducibility.
- Do not use JSONB as a substitute for normalized core domain tables.

---

## 7. Solver model

### 7.1 Decision variables

For each teaching requirement `r`, compatible starting slot `s`, and compatible room `m` when rooms are enabled:

```text
x[r, s, m] ∈ {0, 1}
```

`x[r, s, m] = 1` means one occurrence of requirement `r` starts in slot `s` using room `m`.

When rooms are disabled, use:

```text
x[r, s] ∈ {0, 1}
```

Precompute compatible starts. Do not create variables for impossible teacher, class, room, forbidden, break, or duration combinations.

### 7.2 Hard constraints

Implement and test these independently:

1. **Exact weekly demand**  
   Each requirement receives exactly its required number of occurrences.

2. **Teacher collision**  
   A teacher occupies at most one lesson in every physical period.

3. **Class collision**  
   A class occupies at most one lesson in every physical period.

4. **Room collision**  
   A room hosts at most one lesson in every physical period.

5. **Availability**  
   No assignment may occupy an unavailable teacher, class, or room period.

6. **Duration continuity**  
   Multi-period sessions occupy consecutive periods on the same day and cannot cross breaks or day boundaries.

7. **Daily minimum and maximum**  
   Requirement occurrences per day respect configured limits.

8. **Distinct days**  
   A requirement is scheduled on at least the required number of distinct days.

9. **Fixed assignments**  
   Fixed and locked assignments must be present exactly as specified.

10. **Forbidden starts**  
    Requirement-specific forbidden slots cannot be used.

11. **Class daily workload**  
    Do not exceed the class's maximum lessons per day.

12. **Teacher daily workload**  
    Respect hard minimum or maximum daily workload only when explicitly configured as hard.

13. **Room type**  
    Assign only compatible rooms.

14. **Disabled slots**  
    Breaks, assemblies, and closed slots cannot contain lessons.

### 7.3 Soft constraints and penalty terms

Model each preference with explicit penalty variables and expose its contribution in the result.

Suggested default relative weights:

| Preference | Default weight |
|---|---:|
| Teacher unavailable | Hard |
| Teacher disliked slot | 20 |
| Missed teacher preferred slot | 2 |
| Teacher first-period avoidance | 8 |
| Teacher last-period avoidance | 5 |
| Teacher internal gap | 12 |
| Part-time teacher internal gap | 25 |
| Teacher exceeds preferred consecutive limit | 15 |
| Class internal gap | 8 |
| Same subject repeated in one day | 10 |
| Poor subject spread | 10 |
| Main subject after session 4 | 8 |
| Heavy subject in late period | 4 |
| Daily workload imbalance | 3 |
| Move from existing hinted schedule | 6 |

Weights must be configurable in a `ConstraintProfile`.

### 7.4 Optimization strategy

Use lexicographic or staged optimization:

1. Find any hard-feasible schedule.
2. Minimize high-priority penalties.
3. Minimize remaining preference penalties.
4. Generate alternatives by adding diversity constraints or changing seeds while keeping quality within an acceptable threshold.

Do not claim `OPTIMAL` unless the solver reports it. A high-quality schedule found within the time limit is `FEASIBLE`.

### 7.5 Alternative generation

To avoid returning near-identical schedules:

- Generate the best solution.
- For each next alternative, add a diversity term measuring assignments that differ from previous alternatives.
- Keep the soft-penalty score within a configurable percentage of the best score.
- Store both quality score and diversity score.

### 7.6 Infeasibility diagnostics

Use three levels:

#### Level 1 — deterministic prechecks
Run the checks in section 5.8.

#### Level 2 — assumption-based conflict core
Where practical, attach CP-SAT assumption literals to groups of hard constraints and retrieve a sufficient infeasible assumption set. Map these assumptions back to human-readable entities.

#### Level 3 — diagnostic relaxation
Create a diagnostic model that allows selected hard rules to be violated using extremely expensive slack variables. Solve only for diagnosis, never as a valid timetable. Report the smallest or cheapest set of relaxations discovered.

Diagnostic output example:

```json
{
  "status": "INFEASIBLE",
  "issues": [
    {
      "code": "TEACHER_CAPACITY_SHORTAGE",
      "summary": "Teacher Rami needs 18 periods but has only 15 compatible periods.",
      "entityIds": ["teacher-rami"],
      "required": 18,
      "available": 15,
      "suggestions": [
        "Increase Rami's availability by at least 3 periods.",
        "Assign one requirement to another qualified teacher."
      ]
    }
  ]
}
```

---

## 8. Solver API contract

### POST `/v1/solve`

Request:

```json
{
  "schemaVersion": 1,
  "jobId": "uuid",
  "school": {
    "id": "uuid",
    "timezone": "Asia/Beirut"
  },
  "calendar": {
    "days": [
      {"id": "mon", "index": 0, "name": "Monday"}
    ],
    "periods": [
      {"id": "p1", "index": 0, "name": "Period 1", "isTeaching": true}
    ]
  },
  "teachers": [],
  "subjects": [],
  "classSections": [],
  "rooms": [],
  "requirements": [],
  "lockedAssignments": [],
  "constraintProfile": {
    "id": "balanced",
    "weights": {}
  },
  "options": {
    "alternativeCount": 3,
    "timeLimitSeconds": 30,
    "randomSeed": 12345,
    "roomsEnabled": false,
    "useExistingScheduleHint": false
  }
}
```

Response:

```json
{
  "schemaVersion": 1,
  "jobId": "uuid",
  "inputFingerprint": "sha256",
  "status": "FEASIBLE",
  "runtimeMs": 8142,
  "alternatives": [
    {
      "rank": 1,
      "solverStatus": "FEASIBLE",
      "totalPenalty": 84,
      "penaltyBreakdown": {
        "TEACHER_GAP": 48,
        "SUBJECT_SPREAD": 20,
        "LATE_HEAVY_SUBJECT": 16
      },
      "assignments": [
        {
          "requirementId": "uuid",
          "dayIndex": 0,
          "periodIndex": 1,
          "duration": 1,
          "roomId": null
        }
      ]
    }
  ],
  "diagnostics": [],
  "warnings": []
}
```

### POST `/v1/validate`

Validates input and manual assignments without performing full optimization.

### GET `/health`

Returns service status and OR-Tools version.

### Contract rules

- Use integer indexes for solver arrays but preserve stable IDs in request and response.
- Validate the complete payload with Pydantic.
- Reject unknown schema versions.
- Compute a canonical SHA-256 input fingerprint.
- Return structured errors; never return only a stack trace.
- Log job ID, fingerprint, solver status, runtime, variable count, and constraint count.
- Do not log personal credentials or secrets.

---

## 9. Application workflows

### Initial setup wizard

1. Create the academic term.
2. Define days and periods.
3. Add teachers.
4. Add classes.
5. Add subjects.
6. Add rooms or disable room scheduling.
7. Add teaching requirements.
8. Enter availability.
9. Run readiness validation.
10. Generate timetable.

Show setup completion percentages and blocking errors.

### Generation workflow

1. Administrator selects a constraint profile.
2. Application creates an immutable input snapshot.
3. Application creates a `GenerationJob`.
4. Solver processes the job.
5. UI shows status and runtime.
6. Alternatives are stored.
7. Administrator compares alternatives.
8. Administrator opens one as a draft schedule.
9. Administrator edits and locks assignments.
10. Administrator publishes the final version.

### Regeneration workflow

1. Copy the current schedule into a new draft version.
2. Preserve locked assignments as hard constraints.
3. Optionally add an objective penalty for moving existing unlocked assignments.
4. Solve.
5. Display what moved and why.

---

## 10. User interface pages

```text
/login
/dashboard
/setup
/settings/calendar
/teachers
/teachers/[id]
/classes
/classes/[id]
/subjects
/rooms
/requirements
/availability
/constraints
/generate
/generation/[jobId]
/schedules
/schedules/[scheduleId]
/schedules/[scheduleId]/edit
/exports
```

### Important UI components

- Reusable weekly availability grid.
- Teaching-requirement table with inline validation.
- Readiness checklist.
- Generation progress card.
- Alternative score comparison.
- Timetable grid.
- Conflict drawer.
- Assignment details drawer.
- Lock indicator.
- Unassigned lesson tray.
- Undo and redo controls.
- Print layout.

The interface should work well on desktop and remain readable on tablets. Timetable editing is desktop-first.

---

## 11. Validation and error handling

### Application-level validation

- Use Zod for form and API validation.
- Validate names, codes, positive counts, ranges, and referential integrity.
- Prevent deleting entities used by published schedules.
- Warn before changing calendar structure after schedules exist.

### Solver errors

Map solver and service errors to:

- Validation error.
- Infeasible model.
- Time limit reached with feasible solution.
- Time limit reached without solution.
- Internal solver failure.
- Contract version mismatch.

The UI must never display a generic “Something went wrong” when a more specific cause is available.

---

## 12. Security and audit requirements

- Authenticate all administrative routes.
- Authorize all data by school ID, even though the MVP has one school.
- Keep secrets in environment variables.
- Never commit `.env` files.
- Validate solver payload size.
- Add request timeouts.
- Sanitize CSV cells to prevent spreadsheet formula injection.
- Record audit events for published schedule changes, manual moves, locks, unlocks, and generation.
- Back up the PostgreSQL database.
- Do not expose solver internals publicly without authentication.

---

## 13. Testing strategy

### Unit tests

Web application:

- Availability calculations.
- Weekly capacity calculations.
- Teaching requirement validation.
- Manual move collision detection.
- Score display calculations.
- Snapshot canonicalization and fingerprinting.

Solver:

- Exact weekly counts.
- Teacher collision.
- Class collision.
- Room collision.
- Unavailability.
- Fixed lessons.
- Double periods.
- Daily maxima.
- Distinct days.
- Subject spread.
- Teacher gaps.
- Teacher daily internal gap maximum.
- Locked regeneration.
- Infeasible datasets.
- Determinism for a fixed seed and time-independent settings.

### Integration tests

- Create all setup data and submit a solver job.
- Persist alternatives.
- Open an alternative as a draft.
- Lock assignments and regenerate.
- Publish a schedule.
- Reject an invalid manual move.

### End-to-end tests

1. Administrator completes a small-school setup and generates a schedule.
2. Administrator sees an infeasibility explanation.
3. Administrator moves a lesson, locks it, and regenerates.
4. Administrator prints class and teacher views.

### Performance targets for MVP

On a normal development machine:

- Small dataset: under 5 seconds.
- Medium dataset: return a feasible schedule within 30 seconds when one exists in the test fixture.
- UI interactions excluding generation: under 500 ms perceived response for ordinary CRUD operations.

Do not make universal performance claims. Record benchmark dataset size and hardware.

---

## 14. Acceptance criteria

The MVP is accepted only when all are true:

1. An administrator can configure a five- or six-day school week.
2. Teachers, classes, subjects, rooms, requirements, and availability can be created and edited.
3. The application detects listed deterministic impossibilities before generation.
4. The solver creates a timetable that violates zero hard constraints for the supplied feasible fixture.
5. Every scheduled requirement has the exact weekly count.
6. The same teacher, class, or room is never double-booked.
7. Part-time and unavailable periods are respected.
8. At least three alternatives can be generated for a fixture with multiple valid solutions.
9. Alternatives show total score and penalty breakdown.
10. The administrator can manually move or swap lessons.
11. Invalid moves are rejected with a specific reason.
12. Locked lessons remain fixed after regeneration.
13. A selected schedule can be published.
14. Class and teacher timetables are printable.
15. Automated tests run in CI.
16. Setup and local-development instructions work from a clean clone.

---

## 15. Delivery phases

### Phase 0 — repository and development foundation

Deliver:

- Monorepo.
- Docker Compose.
- Next.js application.
- Python solver service.
- PostgreSQL and Prisma.
- Linting, formatting, type checking, tests, and CI.
- Health checks.
- Initial documentation.

Do not implement the full solver yet.

### Phase 1 — domain model and CRUD

Deliver:

- Authentication.
- Calendar setup.
- Teacher, subject, class, room, and requirement CRUD.
- Availability grid.
- Database migrations and seed data.
- Form validation.

### Phase 2 — readiness validation and snapshot

Deliver:

- Deterministic feasibility prechecks.
- Immutable solver snapshot builder.
- Input fingerprint.
- Readiness checklist.
- Unit tests.

### Phase 3 — core CP-SAT solver

Deliver:

- Pydantic contract.
- Exact weekly counts.
- Teacher, class, and room collision constraints.
- Availability.
- duration and double periods.
- Fixed and forbidden slots.
- First feasible schedule.
- Solver unit tests.

### Phase 4 — soft constraints and alternatives

Deliver:

- Weighted objective.
- Penalty breakdown.
- Constraint profiles.
- Multiple diverse alternatives.
- Benchmark fixtures.

### Phase 5 — generation jobs and timetable views

Deliver:

- Job lifecycle.
- Polling.
- Persisted alternatives.
- Whole-school, class, teacher, and room views.
- Comparison UI.

### Phase 6 — editor, locks, and regeneration

Deliver:

- Drag-and-drop or explicit move flow.
- Swap.
- Immediate hard-constraint validation.
- Lock and unlock.
- Regenerate unlocked lessons.
- Undo and redo.

### Phase 7 — diagnostics, export, and hardening

Deliver:

- Conflict-core or relaxation diagnostics.
- CSV and print exports.
- Audit log.
- Security review.
- End-to-end tests.
- Deployment documentation.

---

## 16. Non-goals for the MVP

Do not add these until the core scheduling product is accepted:

- Multiple paying schools.
- Billing and subscriptions.
- Student or parent accounts.
- Attendance.
- Gradebook.
- Payroll.
- Substitute-teacher automation.
- AI chat features.
- Mobile app.
- Real-time collaboration.
- Calendar synchronization.
- WhatsApp messaging.

---

## 17. Definition of done for every feature

A feature is not done unless:

- Business behavior is documented.
- Database migration is included when needed.
- Inputs are validated.
- Authorization is enforced.
- Error states are handled.
- Unit or integration tests cover the critical behavior.
- Lint, format, type check, and tests pass.
- Documentation is updated.
- No hard scheduling constraint is silently weakened.
