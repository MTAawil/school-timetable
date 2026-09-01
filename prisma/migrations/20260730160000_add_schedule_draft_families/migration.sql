ALTER TABLE "Schedule"
ADD COLUMN "draftFamilyId" UUID,
ADD COLUMN "isSavedDraft" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "savedAt" TIMESTAMP(3);

WITH RECURSIVE schedule_families AS (
  SELECT
    "id",
    "id" AS "familyId"
  FROM "Schedule"
  WHERE "parentScheduleId" IS NULL

  UNION ALL

  SELECT
    child."id",
    schedule_families."familyId"
  FROM "Schedule" child
  INNER JOIN schedule_families
    ON child."parentScheduleId" = schedule_families."id"
)
UPDATE "Schedule" schedule
SET "draftFamilyId" = schedule_families."familyId"
FROM schedule_families
WHERE schedule."id" = schedule_families."id";

UPDATE "Schedule" schedule
SET
  "isSavedDraft" = true,
  "savedAt" = schedule."updatedAt"
WHERE schedule."status" <> 'DRAFT'
   OR NOT EXISTS (
     SELECT 1
     FROM "Schedule" child
     WHERE child."parentScheduleId" = schedule."id"
   );

ALTER TABLE "Schedule"
ALTER COLUMN "draftFamilyId" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "draftFamilyId" SET NOT NULL,
ALTER COLUMN "isSavedDraft" SET DEFAULT true;

CREATE INDEX "Schedule_schoolId_termId_draftFamilyId_isSavedDraft_idx"
ON "Schedule"("schoolId", "termId", "draftFamilyId", "isSavedDraft");
