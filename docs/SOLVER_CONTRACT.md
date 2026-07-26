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

Diagnostic relaxation is never a valid production schedule. Mark diagnostic assignments and violations separately and never expose them as a selectable schedule alternative.
