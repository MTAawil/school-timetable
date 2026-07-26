ALTER TABLE "ScheduleAssignment"
DROP CONSTRAINT "ScheduleAssignment_position_check";

ALTER TABLE "ScheduleAssignment"
ADD CONSTRAINT "ScheduleAssignment_position_check"
CHECK (
  (
    (
    "startDayIndex" IS NULL
    AND "startPeriodIndex" IS NULL
    )
    OR (
    "startDayIndex" BETWEEN 0 AND 6
    AND "startPeriodIndex" >= 0
    )
  )
  AND "durationPeriods" > 0
);
