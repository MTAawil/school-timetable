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
- Error code `COLLISION:TEACHER_TIME:<teacher-id>`.
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

## Supervisor redesign fixtures

The readable JSON sources live under `docs/fixtures/supervisor-redesign/`. R0
defines their contract; R1-R6 move applicable fixtures into executable domain,
integration, and solver tests without changing their meanings.

### Stable redesign readiness codes

| Code | Meaning |
| --- | --- |
| `SCHOOL_WEEK_INCOMPLETE` | Working days, sessions, duration, or break configuration is missing. |
| `BREAK_CONFIGURATION_INVALID` | The break is not between teaching sessions or has invalid duration. |
| `CURRICULUM_EMPTY` | No active grade has required subject sessions. |
| `CURRICULUM_EXCEEDS_CLASS_CAPACITY` | A class curriculum exceeds its physical weekly capacity. |
| `CLASS_SUBJECT_UNASSIGNED` | A class-subject has no teacher. |
| `CLASS_SUBJECT_MULTIPLE_TEACHERS` | Multiple teachers claim one class-subject. |
| `TEACHER_WORKLOAD_MISMATCH` | Allocated sessions do not exactly equal declared workload. |
| `NON_MAIN_DAILY_CAPACITY_SHORTAGE` | A non-main subject requires more sessions than working days. |
| `DOUBLE_REQUIRED_BUT_DISABLED` | A main subject needs a same-day pair, but doubles are disabled. |
| `MAIN_DAILY_CAPACITY_SHORTAGE` | Main-subject demand exceeds two sessions per working day. |
| `TEACHER_CAPACITY_SHORTAGE` | Hard availability or limits provide insufficient teacher capacity. |

Every blocking issue includes related IDs, required and actual or available
values, a plain-language summary, and a correction link.

### R01 - complete supervisor setup

- Five days, eight sessions per day, and one break after session four.
- Two G7 sections.
- Mathematics is main, requires five sessions, and allows doubles.
- History is non-main and requires two sessions.
- Every class-subject has one teacher.
- Teacher declared and allocated workloads match.

Expected: readiness succeeds and every section receives exact curriculum
sessions in a hard-valid schedule.

### R02 - exact teacher workload mismatch

Rawan declares nine sessions while allocations total ten.

Expected: `TEACHER_WORKLOAD_MISMATCH`, declared 9, allocated 10, and no solver
job.

### R03 - uncovered class-subject

G7-A requires History, but no teacher owns it.

Expected: `CLASS_SUBJECT_UNASSIGNED` identifying G7-A and History.

### R04 - duplicate class-subject ownership

Two teachers claim G7-A Mathematics.

Expected: `CLASS_SUBJECT_MULTIPLE_TEACHERS`; persistence and generation are
rejected.

### R05 - impossible non-main frequency

A non-main subject requires six sessions over five days.

Expected: `NON_MAIN_DAILY_CAPACITY_SHORTAGE`, required 6, available 5.

### R06 - optional main-subject double

Main Mathematics requires six sessions over five days and allows doubles.

Expected: feasible; same-day pairs are preferred adjacent, no day is above two
sessions, and distributed same-day pairs remain valid when needed.

### R07 - required pair disabled

Main Mathematics requires six sessions over five days, but doubles are disabled.

Expected: `DOUBLE_REQUIRED_BUT_DISABLED`.

### R08 - main-subject daily capacity impossible

Main Mathematics requires eleven sessions over five days.

Expected: `MAIN_DAILY_CAPACITY_SHORTAGE`, required 11, available 10.

### R09 - full-time balance scoring

A full-time teacher has 25 weekly sessions. Compare `5,5,5,5,5`,
`6,5,5,5,4`, and `7,7,5,3,3`.

Expected: penalties increase in that order and the perfectly balanced candidate
has zero `FULL_TIME_DAILY_BALANCE` penalty.

### R10 - non-main post-solve rejection

A candidate places two non-main History sessions for G7-A on Monday.

Expected: independent validation rejects it with
`SUBJECT_DAILY_REPEAT:G7-A:HISTORY`.
