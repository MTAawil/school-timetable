# Acceptance Test Fixtures

Create all fixtures as readable JSON and load them in both pytest and application integration tests where practical.

## Fixture A — minimal feasible

- 5 days.
- 4 teaching periods per day.
- 2 classes.
- 3 teachers.
- No rooms.
- At least 10 teaching requirements.
- One part-time teacher.
- One teacher unavailable in first periods.

Expected:

- `FEASIBLE` or `OPTIMAL`.
- Exact counts.
- Zero hard violations.
- Part-time availability respected.

## Fixture B — teacher capacity impossible

- Teacher A has 12 required occupied periods.
- Teacher A has only 10 compatible physical periods.

Expected precheck:

- `TEACHER_CAPACITY_SHORTAGE`.
- Required = 12.
- Available = 10.
- No full solver run.

## Fixture C — fixed collision

- Two requirements for the same teacher are fixed at Monday period 2.

Expected precheck:

- `FIXED_TEACHER_COLLISION`.

## Fixture D — double-period impossible

- Laboratory requirement needs two occurrences of duration 2.
- Only one compatible consecutive pair exists.

Expected precheck:

- `INSUFFICIENT_CONSECUTIVE_SLOTS`.

## Fixture E — room conflict

- Two fixed laboratory lessons use the same laboratory at the same time.

Expected:

- `FIXED_ROOM_COLLISION`.

## Fixture F — alternatives

- Small symmetric dataset with many valid schedules.

Expected:

- Three alternatives.
- Each has zero hard violations.
- At least one assignment differs between each alternative pair.
- Penalty scores remain within the configured quality threshold.

## Fixture G — locked regeneration

- Generate a feasible schedule.
- Lock three assignments.
- Regenerate.

Expected:

- All locked assignments remain unchanged.
- No hard violations.
- Response reports moved assignments.

## Fixture H — manual move rejection

- Attempt to move an assignment into a slot where its teacher is already teaching.

Expected:

- Move rejected.
- Error code `COLLISION:TEACHER:<teacher-id>`.
- Existing draft remains unchanged.

## Fixture I — subject spread scoring

Create two feasible candidate patterns:

- Candidate 1 places four mathematics lessons on four days.
- Candidate 2 places them on two days.

Expected:

- Candidate 1 has a lower subject-spread penalty.

## Fixture J — part-time compactness

A part-time teacher teaches three lessons in one day.

Expected:

- Compact placement has lower penalty than placements containing internal gaps.
