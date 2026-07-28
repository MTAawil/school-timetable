# Data Model Notes

This document supplements `PRODUCT_BLUEPRINT.md`. Codex may refine field names, but it must preserve the domain behavior.

## Suggested enums

```text
EmploymentType = FULL_TIME | PART_TIME
AvailabilityState = AVAILABLE | PREFERRED | DISLIKED | UNAVAILABLE
PreferredTimeBand = EARLY | NEUTRAL | LATE
GenerationStatus = QUEUED | RUNNING | FEASIBLE | OPTIMAL | INFEASIBLE | FAILED | CANCELLED
ScheduleStatus = DRAFT | PUBLISHED | ARCHIVED
ConstraintKind = HARD | SOFT
RoomType = STANDARD | LAB | COMPUTER_LAB | GYM | OTHER
```

## Availability modeling

Use a generic `AvailabilityRule` table with:

- id
- schoolId
- termId
- entityType: TEACHER | CLASS_SECTION | ROOM
- entityId
- dayIndex
- periodIndex
- state
- optional reason

Add a uniqueness constraint on `(termId, entityType, entityId, dayIndex, periodIndex)`.

## Calendar modeling

Store `DayDefinition` and `PeriodDefinition`. A physical slot can be derived, but a `Slot` table is acceptable when it simplifies foreign keys for fixed assignments and locks.

A period definition contains `isTeaching`. Breaks are represented as non-teaching periods so duration continuity can detect and reject crossing them.

## TeachingRequirement

Recommended fields:

- id
- schoolId
- termId
- classSectionId
- subjectId
- teacherId
- weeklyOccurrences
- durationPeriods
- minOccurrencesPerDay
- maxOccurrencesPerDay
- minimumDistinctDays
- allowMultipleOccurrencesSameDay
- requiredRoomId nullable
- requiredRoomType nullable
- isActive
- notes

Clarify naming in the UI: if a two-period laboratory must happen twice per week, `weeklyOccurrences = 2` and `durationPeriods = 2`, producing four occupied physical periods.

## Schedule versioning

Do not mutate a published schedule in place.

- A generated alternative is immutable.
- Opening an alternative for editing creates a `DRAFT` schedule.
- Manual changes update only the draft and append audit events.
- Publishing archives the previous published version for the same term or marks it historical.
- Regeneration creates a derived draft linked with `parentScheduleId`.

## Assignment

Recommended fields:

- id
- scheduleId
- teachingRequirementId
- startDayIndex
- startPeriodIndex
- durationPeriods
- roomId nullable
- isLocked
- source: GENERATED | MANUAL | FIXED
- createdAt
- updatedAt

A duration-two assignment is one logical assignment occupying two physical periods.

## Generation snapshot

Persist:

- canonical request JSON
- input fingerprint
- solver schema version
- application commit SHA when available
- solver commit SHA when available
- options
- timestamps
- response metadata

This permits reproducibility and later investigation.

## Supervisor redesign target model

This section is authoritative for redesign tasks R1-R8. It refines the older
`TeachingRequirement` recommendation above; R1 must migrate through a new
Prisma migration and must not edit existing migrations.

### GradeLevel

School-owned, term-independent grade catalogue:

- id
- schoolId
- code, unique per active school, for example `G12_LS`
- name, for example `G12 LS`
- displayOrder
- isActive
- createdAt
- updatedAt
- deletedAt nullable

Default grade levels are copied into the school during onboarding. They are not
shared mutable global records.

### ClassSection

Retain the existing class entity and add:

- gradeLevelId
- sectionLabel, for example `A` or `AA`
- generatedName
- generatedShortCode

Required uniqueness:

- `(schoolId, termId, gradeLevelId, sectionLabel)`
- existing school/term short-code uniqueness

The visible name and short code remain editable. Grade ownership and section
label remain stable.

### GradeCurriculum

One curriculum template row per grade-subject:

- id
- schoolId
- termId
- gradeLevelId
- subjectId
- weeklySessions, integer greater than zero
- isMainSubject
- allowDoubleSession
- isActive
- createdAt
- updatedAt

Required uniqueness:

- `(schoolId, termId, gradeLevelId, subjectId)`

`allowDoubleSession` must be false when `isMainSubject` is false.

### ClassCurriculum

Materialized curriculum ownership for one active section:

- id
- schoolId
- termId
- classSectionId
- gradeCurriculumId
- subjectId
- weeklySessions
- isMainSubject
- allowDoubleSession
- teacherId nullable during setup
- isActive
- createdAt
- updatedAt

Required uniqueness:

- `(schoolId, termId, classSectionId, subjectId)`

This entity replaces the setup meaning of `TeachingRequirement`. It is created
or synchronized from `GradeCurriculum` for every section. The teacher remains
nullable until allocation is complete, but readiness and solver snapshot
creation require exactly one teacher.

Curriculum totals are not duplicated in a separate teacher-allocation table.
Assigning `teacherId` to `ClassCurriculum` expresses the one-teacher ownership
rule without permitting ambiguous duplicate allocation rows.

Historical `TeachingRequirement` records remain supported during migration.
R1 must define an explicit conversion into `ClassCurriculum`; it must not delete
referenced historical schedules.

### Teacher

Retain existing fields and add:

- weeklyTeachingSessions, required positive integer

The allocated load is derived:

```text
sum(ClassCurriculum.weeklySessions where teacherId = teacher.id and isActive)
```

Exact equality between declared and allocated load is a cross-row domain rule.
It is enforced in readiness and transactional application services rather than
pretending a row-level database check can enforce the aggregate.

Existing optional fields retain these meanings:

- maxLessonsPerDay: hard limit when set
- maxConsecutiveLessons: hard limit when set
- employmentType: selects full-time balance or part-time compactness preference

### SchoolWeekConfiguration

One active configuration per term:

- id
- schoolId
- termId
- workingDayCount
- sessionsPerDay
- sessionDurationMinutes
- firstSessionStartMinutes
- breakAfterSession
- breakDurationMinutes
- createdAt
- updatedAt

Required checks:

- workingDayCount is positive and supported by active `DayDefinition` rows
- sessionsPerDay is positive
- sessionDurationMinutes is positive
- firstSessionStartMinutes is within one day
- breakAfterSession is between 1 and `sessionsPerDay - 1`
- breakDurationMinutes is positive

`DayDefinition`, `PeriodDefinition`, and `Slot` remain the normalized physical
calendar. They are deterministically rebuilt from this configuration.

### Subject defaults

`Subject` remains school-owned and editable. Starter subjects are copied into a
new school and are not global foreign keys. Historical references prevent hard
deletion; the subject is deactivated instead.

### Availability

The primary redesign uses teacher availability only:

- `UNAVAILABLE` is hard
- `PREFERRED` is soft
- `DISLIKED` is displayed as `AVOID` and is soft
- absence of a rule means ordinarily available

The normalized `AvailabilityRule` entity remains because historical class and
room rules may exist, but those entity types are hidden from the redesigned
supervisor workflow.

### Solver snapshot boundary

The application expands complete `ClassCurriculum` rows into solver
requirements. Incomplete rows with a null teacher never enter a solver
snapshot.

The redesigned snapshot must include:

- grade level identity for diagnostics
- class and subject identity
- physical `weeklySessions`
- `isMainSubject`
- `allowDoubleSession`
- exact teacher weekly workload
- existing hard and soft teacher restrictions

Every snapshot remains immutable, canonicalized, fingerprinted, and independent
from database access by the Python solver.
