# Soft Constraint Formulas

All soft penalties are nonnegative integers. A configured weight of zero
disables the term. The alternative total is exactly the sum of the weighted
components below.

| Code | Raw penalty formula | Default |
| --- | --- | ---: |
| `TEACHER_AVAILABILITY` | One per occupied disliked teacher slot, plus one per occupied non-preferred slot when that teacher has at least one explicitly preferred slot. | 20 |
| `FIRST_LAST_PERIOD` | One per occupied physical period at the first or last teaching period of a day. | 2 |
| `TEACHER_GAP` | One per empty teaching period strictly between a teacher's first and last occupied periods on a day. | 12 |
| `PART_TIME_COMPACTNESS` | The teacher-gap count, applied only to part-time teachers. | 10 |
| `TEACHER_CONSECUTIVE_PREFERENCE` | Number of occupied periods minus adjacent occupied-period pairs, summed per teacher and day. This is the number of separate teaching blocks. | 3 |
| `SUBJECT_SPREAD` | Weekly occurrences minus distinct occupied days, summed per teaching requirement. | 10 |
| `REPEATED_SUBJECT_DAY` | Weekly occurrences minus distinct occupied days, independently weighted as the same-day repetition cost. | 8 |
| `LATE_HEAVY_SUBJECT` | For an early subject, the zero-based teaching-period rank; for a late subject, the reversed rank; neutral subjects cost zero. Applied per occupied period. | 4 |
| `MAIN_SUBJECT_LATE_SESSION` | One per occupied schema-v2 main-subject teaching session after the first four teaching sessions of the day. | 8 |
| `DAILY_WORKLOAD_BALANCE` | For each teacher and working day: `abs(dayPeriods * workingDayCount - weeklyPeriods)`. | 2 |

The CP-SAT model minimizes these weighted terms directly. After solving, an
independent scorer recomputes every component from the returned assignments. A
result is marked `FAILED` if the independently calculated total differs from
the CP-SAT objective.
