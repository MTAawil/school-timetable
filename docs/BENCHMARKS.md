# Fixture Benchmarks

Measured on 2026-07-26 using a Lenovo ThinkPad `20SYS26S00`, Intel Core
i5-10210U (4 cores, 8 logical processors), 15.7 GB RAM, Windows, Python 3.12.10,
and OR-Tools 9.15.6755.

These are local observations, not universal service-level guarantees. CP-SAT
results vary with dataset shape, constraints, hardware, and configured time
limits.

## Solver fixtures

The shared solver dataset used by Fixtures A, F, and G has 3 teachers, 2
classes, 10 requirements, and 20 enabled weekly slots.

| Fixture | Scenario | Measured pytest call |
| --- | --- | ---: |
| A | One feasible optimized timetable | 8.27 s |
| A API | HTTP contract and fingerprint | 10.09 s |
| F | Three quality-bounded diverse alternatives | 10.34 s |
| G | Baseline plus locked regeneration and movement report | 10.42 s |
| Diagnostic | Invalid fixed slot detected before relaxation | under 0.1 s solver work |

Times came from:

```bash
python -m pytest services/solver/tests/test_solve.py -q --durations=10
```

## Readiness fixtures

Fixtures B-E are deterministic TypeScript prechecks and do not invoke CP-SAT.

| Fixture | Teachers | Classes | Requirements | Calendar capacity |
| --- | ---: | ---: | ---: | ---: |
| B | 1 | 1 | 1 | 2 days x 5 periods |
| C | 1 | 2 | 2 | 2 days x 4 periods |
| D | 1 | 1 | 1 | 2 days x 4 periods |
| E | 2 | 2 | 2 | 1 day x 2 periods |

Correctness tests do not assert wall-clock thresholds. Performance regressions
should be evaluated using the same fixture, solver version, seed, worker count,
and hardware description.
