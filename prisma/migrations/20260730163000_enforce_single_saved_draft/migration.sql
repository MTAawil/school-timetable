UPDATE "Schedule"
SET "isSavedDraft" = false
WHERE "status" = 'DRAFT';

WITH latest_drafts AS (
  SELECT DISTINCT ON ("schoolId", "termId", "draftFamilyId")
    "id"
  FROM "Schedule"
  WHERE "status" = 'DRAFT'
  ORDER BY
    "schoolId",
    "termId",
    "draftFamilyId",
    "version" DESC
)
UPDATE "Schedule" schedule
SET
  "isSavedDraft" = true,
  "savedAt" = COALESCE(schedule."savedAt", schedule."updatedAt")
FROM latest_drafts
WHERE schedule."id" = latest_drafts."id";

CREATE UNIQUE INDEX "Schedule_single_saved_draft_per_family_idx"
ON "Schedule"("schoolId", "termId", "draftFamilyId")
WHERE "isSavedDraft" = true AND "status" = 'DRAFT';
