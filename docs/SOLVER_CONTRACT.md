# Solver Implementation Contract

## Architectural boundary

The solver is a pure optimization service. It must not query the application database. The web application sends a complete validated snapshot.

## Python package layout

```text
services/solver/
├── pyproject.toml
├── app/
│   ├── main.py
│   ├── api.py
│   ├── schemas.py
│   ├── canonicalize.py
│   ├── precheck.py
│   ├── compatibility.py
│   ├── model/
│   │   ├── builder.py
│   │   ├── variables.py
│   │   ├── hard_constraints.py
│   │   ├── soft_constraints.py
│   │   ├── objective.py
│   │   ├── alternatives.py
│   │   └── diagnostics.py
│   └── result_mapper.py
└── tests/
    ├── fixtures/
    ├── test_prechecks.py
    ├── test_hard_constraints.py
    ├── test_soft_constraints.py
    ├── test_diagnostics.py
    └── test_api.py
```

## Modeling rules

1. Precompute compatibility before creating Boolean variables.
2. A logical assignment with duration `n` occupies `n` physical periods.
3. Collision constraints operate on occupied physical periods, not only start slots.
4. Breaks and day boundaries invalidate a multi-period start.
5. Every objective term must have a named penalty code.
6. Return a penalty breakdown that exactly sums to total penalty.
7. Use integer coefficients only.
8. A fixed random seed must be accepted.
9. Tests must not depend on wall-clock timing for correctness.
10. Never return an assignment that failed post-solve validation.

## Post-solve validation

Independently validate every candidate solution before returning it:

- exact counts
- teacher collisions
- class collisions
- room collisions
- availability
- duration continuity
- fixed and locked assignments
- daily limits
- required room compatibility

If validation fails, log the violation and return `FAILED`, not `FEASIBLE`.

For schema version 2, teacher collisions are evaluated by actual class clock
intervals derived from each class section's recess position. Two lessons for
the same teacher may use different period indexes across timing groups only
when their derived clock intervals do not overlap.

## Alternative generation

Prefer quality first. Alternative 2 and later should differ meaningfully from earlier solutions while staying near the best penalty score. Add tests that verify alternatives differ for a fixture designed with many feasible solutions.

## Regeneration

- `lockedAssignments` are hard constraints, including day, period, duration, and
  room.
- `existingAssignments` describe the edited draft before regeneration.
- When `useExistingScheduleHint` is true, the existing placements are supplied
  as CP-SAT hints and each changed placement adds one movement unit to the
  optimization objective.
- Movement units are reported separately as `movementPenalty`; they are not
  included in the named quality `totalPenalty` or penalty breakdown.
- `movedAssignments` reports requirement IDs and before/after positions.
- Every regenerated result passes the same independent hard-constraint
  validator as a normal generation result.

## Diagnostics

Diagnostics run in this order:

1. Deterministic empty-domain and locked-assignment checks.
2. Deterministic shared-group placement checks and focused CP-SAT packing
   checks for teacher and class-section demand.
3. A separate CP-SAT relaxation that minimizes teacher, class, and room
   occupancy overflow.
4. A stable grouped hard-constraint diagnostic when collision relaxation alone
   cannot isolate the cause.

Diagnostic relaxation is never a valid production schedule. Diagnostic results
contain no selectable alternatives and are persisted separately from feasible
generation alternatives. Teacher packing diagnostics for schema-version-2
snapshots include example same-day clock-overlap pairs when a closest relaxed
teacher packing can be constructed.

## Supervisor redesign solver semantics

This section replaces fixed-duration curriculum semantics for redesign
snapshots. Historical schema-version-1 snapshots remain reproducible.

### Demand unit

`weeklySessions` is the number of physical teaching sessions required for one
class-subject. Every selected solver variable consumes one physical session.

An optional double is not a duration-two requirement. It is two physical
sessions of the same class-subject selected on the same day. Consecutive
teaching periods are preferred, but allowed doubles may be distributed across
the same day when required to satisfy the timetable.

This distinction allows five weekly Mathematics sessions to become:

- five singles
- one double and three singles
- two doubles and one single

without changing curriculum demand.

### Hard constraints

The redesigned solver must enforce:

1. Exact physical `weeklySessions` for every complete class-subject.
2. No teacher collision.
3. No class collision.
4. Teacher `UNAVAILABLE` periods.
5. Existing fixed and locked positions.
6. Optional teacher maximum sessions per day.
7. Optional teacher maximum consecutive sessions.
8. A non-main class-subject has at most one session per day.
9. A main class-subject has at most two sessions per day.
10. When a main class-subject has two sessions in one day, consecutive teaching
    periods that do not cross the break are preferred, not required.
11. Two sessions in one day are forbidden when `allowDoubleSession` is false.
12. Every class-subject has exactly one teacher before the request is accepted.
13. Every teacher's allocated curriculum sessions equal their declared weekly
    teaching sessions before the request is accepted.
14. A shared-teaching group selects identical slots for every member class and
    counts those synchronized sessions once for teacher collision and workload
    constraints.
15. A class-specific recess position marks the break between two teaching
    sessions for that class; it does not remove either teaching session from
    the timetable. The value is a teaching-session number, not a physical
    `periodIndex`. Null uses the school's default break position.
16. A full-time teacher may not have more than two consecutive internal free
    teaching sessions between lessons on the same day. Free time before the
    first lesson or after the last lesson is allowed.

Rooms are omitted from new redesign snapshots. Existing schema-version-1 room
behavior remains unchanged for historical reproducibility.

For schema version 2, solver assignment `periodIndex` values are zero-based
teaching-session indexes, not normalized `PeriodDefinition.periodIndex` values.
The normalized physical calendar may still contain a school-default break row
for calendar setup and teacher availability entry, but solver snapshots remap
the day to `Session 1...N` so class-specific break timing does not remove a
teaching slot from any class. The snapshot includes `firstSessionStartMinutes`,
`sessionDurationMinutes`, and `breakDurationMinutes` so the solver can derive
the real clock interval for each class session.

Teacher hard collisions for schema version 2 are checked by real class clock
intervals. A teacher cannot be assigned to two classes whose lesson intervals
overlap, even when their teaching-session indexes differ because the classes
take breaks at different times. Shared teaching is only valid when every member
class's synchronized session resolves to the same clock interval.

### Optional-double modeling

The CP-SAT model may use one Boolean variable for every compatible
class-subject, session occurrence, day, and teaching period.

For a main subject on a given day:

- sum of selected sessions is at most two
- if the sum is two and no valid adjacent pair is selected, the solver applies
  `MAIN_DOUBLE_ADJACENCY` as a soft penalty

Valid adjacency is defined by teaching-session order, not raw clock minutes.
The applicable class break separates adjacency even when period indices are
numerically consecutive.

The solver must not force an allowed double to occur and must not fail a
schedule solely because an allowed same-day double is distributed.

For schema version 2, main subjects also receive a weighted soft penalty when
placed after the first four teaching sessions of a day. This is a preference,
not a hard restriction.

### Full-time workload balance

For each full-time teacher and day:

```text
absolute(daily sessions * working day count - weekly teaching sessions)
```

The named soft penalty `FULL_TIME_DAILY_BALANCE` is the sum of these integer
deviations. A hard daily maximum, when configured, remains separate and can
never be traded for a lower balance penalty.

### Part-time compactness

Part-time teachers retain named soft penalties for:

- internal gaps
- unnecessary separate teaching blocks
- teaching on more days when an equally feasible compact pattern exists
- repeating a class-subject on the same day only when hard availability makes
  the normal distribution impossible

Explicit availability always overrides compactness and distribution: part-time
teachers are never scheduled in unavailable slots. The named soft penalty
`PART_TIME_DISTRIBUTION_RELAXATION` records each daily-limit or distinct-day
exception used for a schema-version-2 requirement taught by a part-time teacher.

### Post-solve validation

The independent validator must additionally prove:

- exact physical curriculum session totals
- non-main daily uniqueness, except for named part-time distribution relaxation
- main daily maximum of two, except for named part-time distribution relaxation
- no pair when double sessions are disabled, except for named part-time
  distribution relaxation
- declared and allocated teacher totals in the input contract

A violation returns `FAILED`; it is never repaired or ignored after solving.
