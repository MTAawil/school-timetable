# Supervisor Workflow Contract

## Purpose

This document defines the redesign from the school supervisor's point of view.
It is a product contract, not an implementation suggestion. Database, UI, and
solver work must preserve these meanings.

## Using the Application

A supervisor normally works from left to right:

1. **School setup:** enter the school week and choose the grades and number of
   sections.
2. **Curriculum:** choose the subjects taught by each grade and enter their
   weekly sessions, main-subject status, and optional double-session permission.
3. **Teachers:** add each teacher, declare the exact weekly teaching load,
   assign their classes and subjects, and enter their weekly restrictions in
   the same workflow.
4. **Generate:** correct any blocking readiness messages, then ask the system
   for timetable alternatives.
5. **Timetables:** review an alternative, open a draft, make or reject edits,
   lock lessons, regenerate unlocked lessons, export, and publish.

The Overview page shows setup progress and the next action. Publishing makes
that timetable version immutable; later changes create another draft version
instead of changing published history.

## 1. School Setup

The supervisor configures one shared weekly structure:

- Number and names of working days.
- Number of teaching sessions per day.
- One break per day.
- The teaching session after which the break occurs.
- Uniform teaching-session duration.
- Break duration.
- Start time of the first session.

Every working day uses the same structure. The break is not a teaching session
and a double session cannot cross it.

Example:

```text
Days: Monday-Friday
Teaching sessions per day: 8
Session duration: 50 minutes
First session starts: 08:00
Break: 20 minutes after teaching session 4
```

The application calculates all session start and end times.

## 2. Grade Templates and Sections

New schools receive these editable templates in this order:

```text
KG1, KG2, KG3,
G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G11,
G12 LS, G12 ES, G12 GS
```

The supervisor may rename, reorder, add, deactivate, or reactivate a template.
A template is school-owned after creation; changing a global software default
must not silently modify an existing school.

For every template, the supervisor selects a section count from zero upward.
Zero means the grade is not offered during that term.

Default section labels use spreadsheet-style letters:

```text
1 -> A
2 -> B
...
26 -> Z
27 -> AA
```

Examples:

```text
G7 with 3 sections -> G7-A, G7-B, G7-C
G12 LS with 1 section -> G12-LS-A
```

The generated class name and short code are editable. Renaming a class does not
change its grade ownership or curriculum.

Reducing a section count is allowed only when the removed section has no
teacher allocations, generated schedule history, or other protected
references. Otherwise the application explains why it cannot be removed.

## 3. Subject Catalogue

New schools receive an editable starter catalogue:

```text
Arabic
English
Mathematics
Science
Physics
Chemistry
Biology
History
Geography
Civics
Computer Science
Physical Education
Art
Music
Religion
French
```

The supervisor may rename, reorder, add, deactivate, or reactivate subjects.
Subjects already referenced by historical schedules are deactivated rather
than deleted.

The starter catalogue is a convenience, not a hardcoded curriculum.

## 4. Grade Curriculum

The supervisor enters curriculum as a grade-by-subject matrix.

Each enabled cell contains:

- Required physical teaching sessions per week.
- Whether the grade-subject is a main subject.
- Whether an optional double session is allowed.

The configured session duration is used only to display calculated clock time.
Scheduling demand is always stored as an integer number of physical sessions.

Example with 50-minute sessions:

| Grade | Subject | Sessions/week | Calculated time | Main | Double allowed |
| --- | --- | ---: | --- | --- | --- |
| G7 | Mathematics | 5 | 4h 10m | Yes | Yes |
| G7 | History | 2 | 1h 40m | No | No |
| G11 | Physics | 4 | 3h 20m | Yes | Yes |

Curriculum is defined once per grade and copied to every active section in that
grade. The redesign does not support different curriculum totals for two
sections of the same grade.

### Default main-subject settings

The initial editable defaults are:

- Arabic, English, and Mathematics are main for every grade where present.
- Physics is additionally main for G11.
- Physics, Chemistry, and Biology are additionally main for G12 LS.

Mathematics remains main in G11 and G12 LS because it is already main for all
grades.

The supervisor may change these settings before teacher allocation.

### Daily subject rule

A non-main grade-subject may appear at most once per class per day.

A main grade-subject may appear:

- Zero times in a day.
- Once in a day.
- Twice in a day only when the two sessions are consecutive and do not cross
  the break.

More than two sessions of the same subject for one class in one day is always
forbidden.

`Double allowed` means the solver may use two consecutive sessions when useful.
It does not require a double session.

Example: five weekly Mathematics sessions may be scheduled as five singles, one
double plus three singles, or two doubles plus one single.

## 5. Teachers and Allocations

Each teacher has:

- Name and short code.
- Full-time or part-time employment type.
- Exact declared physical teaching sessions per week.
- Optional hard maximum sessions per day.
- Optional hard maximum consecutive teaching sessions.

The declared weekly value is exact, not a target and not a maximum.

The supervisor assigns a teacher to each class-subject. One class-subject has
exactly one teacher; split ownership and co-teaching are outside this redesign.

The number of sessions contributed to the teacher is inherited from the class
curriculum and cannot be typed independently.

Example:

| Teacher | Class | Subject | Sessions |
| --- | --- | --- | ---: |
| Rawan | G7-A | Mathematics | 5 |
| Rawan | G7-B | Mathematics | 5 |
| Rawan | G8-A | Mathematics | 5 |
| Rawan | G8-B | Mathematics | 5 |
| Rawan | G9-A | Mathematics | 5 |

Rawan's allocated load is 25. Her declared weekly load must also be 25.

The UI continuously displays:

- Declared sessions.
- Allocated sessions.
- Remaining sessions when under-allocated.
- Excess sessions when over-allocated.

Generation is blocked unless every class-subject has one teacher and every
teacher's allocated total exactly equals the declared total.

Teacher entry is teacher-centered. The supervisor completes the profile,
selects the teaching subject, chooses from only the classes containing that
subject, reviews the workload comparison, and enters weekly restrictions before
continuing to the next teacher. A whole-school summary may show gaps and
mismatches, but it is not the primary data-entry interface.

## 6. Teacher Restrictions

The selected teacher's weekly restriction grid appears inside the Add/Edit
Teacher workflow. Each session is one clickable cell. Repeated clicks cycle:

```text
Available -> Preferred -> Unavailable -> Available
```

The entire cell background changes with its state; the state is not
communicated by text color alone. A visible legend identifies the three states.

### Hard restrictions

- `UNAVAILABLE`: the teacher cannot teach in that session.
- Optional maximum sessions per day.
- Optional maximum consecutive teaching sessions.
- Existing fixed and locked lesson positions.

Hard restrictions can never be violated.

### Soft preferences

- `PREFERRED`: prefer this session.
- `AVOID`: use this session only when it improves feasibility or other weighted
  preferences.
- Full-time weekly balance.
- Part-time compactness and fewer internal gaps.

Soft preferences contribute named penalties. The result remains valid when a
soft preference is violated.

## 7. Workload Distribution

For a full-time teacher, the ideal daily load is the weekly load divided across
the working days as evenly as integers allow.

For 25 sessions over 5 days:

```text
5, 5, 5, 5, 5 -> ideal
6, 5, 5, 5, 4 -> acceptable with a small penalty
7, 7, 5, 3, 3 -> larger penalty
```

Balance is soft unless the supervisor also sets a hard daily maximum.

Part-time teachers use the same exact weekly total, but compact schedules and
their explicit availability are preferred over equal distribution.

## 8. Readiness Review

The review screen must present supervisor-oriented groups:

1. School week.
2. Grades and sections.
3. Curriculum.
4. Teacher coverage.
5. Teacher workloads.
6. Restrictions.

Each blocking issue includes:

- Stable code.
- Plain-language explanation.
- Affected grade, class, subject, or teacher.
- Required and actual values when applicable.
- A direct link to the screen where it can be corrected.

No solver job starts while a blocking issue exists.

## 9. Generation and Later Workflow

After readiness succeeds, the existing capabilities remain:

- Generate and compare alternatives.
- View whole-school, class, and teacher timetables.
- Move and swap lessons with immediate validation.
- Lock lessons and regenerate unlocked lessons.
- Use version history, undo, and redo.
- Export CSV and print.
- Publish an immutable version.
- Review activity history.

Rooms are excluded from the primary redesign workflow and solver input for new
schools. Existing room-aware historical schedules remain readable.

## 10. Explicitly Out of Scope

- Different session structures on different days.
- More than one break per day.
- Split teaching of one class-subject between teachers.
- Co-teaching.
- Required double sessions; doubles are optional only.
- More than two consecutive sessions of the same subject.
- Separate teacher, student, or parent accounts.
- Multi-school operation and billing.
