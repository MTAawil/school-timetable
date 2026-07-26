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
