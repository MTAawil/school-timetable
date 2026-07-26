# School Timetable: Plain-Language Guide

## What is this software?

This software helps a school create its weekly class timetable.

Instead of arranging hundreds of lessons by hand, the school enters its basic
information and asks the software to build a timetable automatically.

The software places lessons while respecting important school rules:

- A teacher cannot teach two classes at the same time.
- A class cannot have two lessons at the same time.
- A teacher cannot be scheduled when unavailable.
- A room cannot be used by two classes at the same time.
- Double lessons must use consecutive periods.
- Every subject must receive the correct number of weekly lessons.

The result is a complete weekly timetable that the school administrator can
review and adjust.

## Who uses it?

The current version is for the school administrator or the person responsible
for preparing the timetable.

It is not a parent portal, student portal, attendance system, payroll system, or
substitute-teacher system.

## What information does the school enter?

### School calendar

- The active school term.
- Working days, such as Monday to Friday.
- Teaching periods and break periods.
- The start and end time of each period.

### Teachers

- Teacher names and codes.
- Full-time or part-time status.
- Maximum lessons per day and consecutive lessons.
- Times when each teacher is available, unavailable, preferred, or disliked.

### Subjects

- Subject names and codes.
- Whether a subject is better taught early or late.
- Whether consecutive periods are preferred.

### Classes

- Class names and codes.
- Maximum lessons per day.
- Homeroom information when needed.

### Rooms

- Classrooms, laboratories, computer rooms, gyms, and special rooms.
- Room capacity and type.

Rooms are optional. The school can create timetables without room scheduling.

### Teaching requirements

This tells the software what must be taught.

For example:

> Grade 7A must receive four Mathematics lessons each week, taught by Maya
> Haddad.

The administrator can also specify double lessons, required rooms, fixed times,
forbidden times, and the minimum number of different teaching days.

## The normal workflow

### 1. Complete the school setup

Enter the calendar, teachers, subjects, classes, rooms, teaching requirements,
and teacher availability.

### 2. Check readiness

The **Readiness** screen checks the data before timetable generation.

It can detect problems such as:

- A teacher has more required lessons than available periods.
- Two lessons are fixed at conflicting times.
- A double lesson has no suitable consecutive periods.
- A required room is already occupied.

The timetable cannot be generated until blocking problems are corrected.

### 3. Generate the timetable

Select the number of alternatives and start generation.

The software creates valid timetable choices and gives each one a quality
penalty. A lower penalty means the timetable better follows the school's
preferences. Every alternative must still obey all mandatory rules.

### 4. Compare alternatives

Alternatives place lessons differently while remaining valid. This gives the
school a choice instead of forcing it to accept only one result.

### 5. Open an alternative as a draft

A draft can be viewed as:

- The whole-school timetable.
- One class timetable.
- One teacher timetable.
- One room timetable.

### 6. Adjust the draft

The administrator can:

- Move or drag a lesson.
- Swap two lessons.
- Place a lesson in the unassigned tray.
- Lock or unlock a lesson.
- Undo or redo changes using saved versions.

Before applying a move, the software shows how it affects timetable quality.

An invalid move is rejected without changing the draft. The software gives a
specific reason, such as a teacher or class collision.

### 7. Lock lessons and regenerate

A locked lesson must remain at its current time.

Regeneration:

- Keeps every locked lesson fixed.
- Tries to keep other lessons near their existing positions.
- Reports which lessons moved.
- Creates a new version instead of overwriting the old one.

### 8. Export, print, and publish

The timetable can be downloaded as a CSV spreadsheet or printed from the
whole-school, class, teacher, or room view.

Publishing makes that version read-only. If another version is published later,
the previous published version is archived.

## Mandatory rules and preferences

### Mandatory rules

These can never be broken:

- No teacher, class, or room collision.
- No lesson during teacher unavailability.
- Correct weekly lesson counts.
- Locked lessons cannot move.

If these rules cannot all be satisfied, the software does not present the
result as a valid timetable.

### Preferences

Preferences improve the timetable but may be compromised when necessary:

- Reduce teacher gaps.
- Avoid too many first or last periods.
- Spread subjects across the week.
- Keep part-time teachers' lessons compact.
- Balance daily workloads.

The administrator controls their importance on the **Quality weights** screen.

## What if no timetable is possible?

The software reports why the timetable is impossible instead of presenting a
broken timetable.

It checks clear problems first, such as a lesson with no possible period or
conflicting locked lessons. It can then report which resource collisions or
groups of limits are causing the conflict.

The school must correct the setup or relax an unnecessary rule before trying
again.

## Are changes saved?

Yes. Generated alternatives are preserved. Manual edits, locks, regeneration,
and publication create saved schedule versions and recorded events.

The **Activity** screen shows recent important actions and the administrator who
performed them.

## What is not included?

The current version is a single-school timetable system for one administrator.
It does not include:

- Separate teacher, student, or parent accounts.
- Attendance or grades.
- Payroll or billing.
- Substitute-teacher management.
- Multi-school management.
