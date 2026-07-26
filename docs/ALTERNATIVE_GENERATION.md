# Alternative Generation

The solver generates alternatives in quality-first order:

1. Solve the weighted soft-constraint objective to obtain the best known
   timetable.
2. Compute the quality ceiling as
   `floor(bestPenalty * (100 + maxQualityDegradationPercent) / 100)`.
3. Add the ceiling as a hard constraint.
4. Exclude every previously returned assignment pattern.
5. Maximize occurrence-level assignment differences from all previous
   alternatives.
6. Independently validate hard constraints and recompute the quality score.

The diversity score is the sum, over every previous alternative, of requirement
occurrences assigned to a different start/room choice. Generation stops early
with a warning when no further distinct timetable exists inside the quality
ceiling.

The administrator may request one to five alternatives and set a maximum
quality degradation from 0% to 100%. The default is three alternatives with a
20% ceiling.
