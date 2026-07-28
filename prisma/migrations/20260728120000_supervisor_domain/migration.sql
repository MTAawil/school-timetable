-- AlterTable
ALTER TABLE "ClassSection" ADD COLUMN     "generatedName" TEXT,
ADD COLUMN     "generatedShortCode" TEXT,
ADD COLUMN     "gradeLevelId" UUID,
ADD COLUMN     "sectionLabel" TEXT;

-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN     "weeklyTeachingSessions" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GradeLevel" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GradeLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolWeekConfiguration" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "workingDayCount" INTEGER NOT NULL,
    "sessionsPerDay" INTEGER NOT NULL,
    "sessionDurationMinutes" INTEGER NOT NULL,
    "firstSessionStartMinutes" INTEGER NOT NULL,
    "breakAfterSession" INTEGER NOT NULL,
    "breakDurationMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolWeekConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradeCurriculum" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "gradeLevelId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "weeklySessions" INTEGER NOT NULL,
    "isMainSubject" BOOLEAN NOT NULL DEFAULT false,
    "allowDoubleSession" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradeCurriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassCurriculum" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "classSectionId" UUID NOT NULL,
    "gradeCurriculumId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "teacherId" UUID,
    "weeklySessions" INTEGER NOT NULL,
    "isMainSubject" BOOLEAN NOT NULL DEFAULT false,
    "allowDoubleSession" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassCurriculum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GradeLevel_schoolId_displayOrder_idx" ON "GradeLevel"("schoolId", "displayOrder");

-- CreateIndex
CREATE INDEX "GradeLevel_schoolId_isActive_idx" ON "GradeLevel"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GradeLevel_schoolId_code_key" ON "GradeLevel"("schoolId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "GradeLevel_id_schoolId_key" ON "GradeLevel"("id", "schoolId");

-- CreateIndex
CREATE INDEX "SchoolWeekConfiguration_schoolId_termId_idx" ON "SchoolWeekConfiguration"("schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolWeekConfiguration_id_schoolId_termId_key" ON "SchoolWeekConfiguration"("id", "schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolWeekConfiguration_termId_schoolId_key" ON "SchoolWeekConfiguration"("termId", "schoolId");

-- CreateIndex
CREATE INDEX "GradeCurriculum_schoolId_termId_isActive_idx" ON "GradeCurriculum"("schoolId", "termId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GradeCurriculum_schoolId_termId_gradeLevelId_subjectId_key" ON "GradeCurriculum"("schoolId", "termId", "gradeLevelId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "GradeCurriculum_id_schoolId_termId_subjectId_key" ON "GradeCurriculum"("id", "schoolId", "termId", "subjectId");

-- CreateIndex
CREATE INDEX "ClassCurriculum_schoolId_termId_teacherId_idx" ON "ClassCurriculum"("schoolId", "termId", "teacherId");

-- CreateIndex
CREATE INDEX "ClassCurriculum_schoolId_termId_isActive_idx" ON "ClassCurriculum"("schoolId", "termId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClassCurriculum_schoolId_termId_classSectionId_subjectId_key" ON "ClassCurriculum"("schoolId", "termId", "classSectionId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassCurriculum_id_schoolId_termId_key" ON "ClassCurriculum"("id", "schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSection_schoolId_termId_gradeLevelId_sectionLabel_key" ON "ClassSection"("schoolId", "termId", "gradeLevelId", "sectionLabel");

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_gradeLevelId_schoolId_fkey" FOREIGN KEY ("gradeLevelId", "schoolId") REFERENCES "GradeLevel"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeLevel" ADD CONSTRAINT "GradeLevel_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolWeekConfiguration" ADD CONSTRAINT "SchoolWeekConfiguration_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolWeekConfiguration" ADD CONSTRAINT "SchoolWeekConfiguration_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeCurriculum" ADD CONSTRAINT "GradeCurriculum_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeCurriculum" ADD CONSTRAINT "GradeCurriculum_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeCurriculum" ADD CONSTRAINT "GradeCurriculum_gradeLevelId_schoolId_fkey" FOREIGN KEY ("gradeLevelId", "schoolId") REFERENCES "GradeLevel"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradeCurriculum" ADD CONSTRAINT "GradeCurriculum_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassCurriculum" ADD CONSTRAINT "ClassCurriculum_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassCurriculum" ADD CONSTRAINT "ClassCurriculum_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassCurriculum" ADD CONSTRAINT "ClassCurriculum_classSectionId_termId_schoolId_fkey" FOREIGN KEY ("classSectionId", "termId", "schoolId") REFERENCES "ClassSection"("id", "termId", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassCurriculum" ADD CONSTRAINT "ClassCurriculum_gradeCurriculumId_schoolId_termId_subjectI_fkey" FOREIGN KEY ("gradeCurriculumId", "schoolId", "termId", "subjectId") REFERENCES "GradeCurriculum"("id", "schoolId", "termId", "subjectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassCurriculum" ADD CONSTRAINT "ClassCurriculum_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassCurriculum" ADD CONSTRAINT "ClassCurriculum_teacherId_schoolId_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "Teacher"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Core redesign values are constrained at the database boundary. Aggregate
-- teacher workload equality remains a transactional/readiness rule.
ALTER TABLE "Teacher"
ADD CONSTRAINT "Teacher_weeklyTeachingSessions_check"
CHECK ("weeklyTeachingSessions" >= 0);

ALTER TABLE "GradeLevel"
ADD CONSTRAINT "GradeLevel_displayOrder_check"
CHECK ("displayOrder" >= 0);

ALTER TABLE "SchoolWeekConfiguration"
ADD CONSTRAINT "SchoolWeekConfiguration_values_check"
CHECK (
  "workingDayCount" BETWEEN 1 AND 7
  AND "sessionsPerDay" > 0
  AND "sessionDurationMinutes" > 0
  AND "firstSessionStartMinutes" BETWEEN 0 AND 1439
  AND "breakAfterSession" BETWEEN 1 AND "sessionsPerDay" - 1
  AND "breakDurationMinutes" > 0
);

ALTER TABLE "GradeCurriculum"
ADD CONSTRAINT "GradeCurriculum_values_check"
CHECK (
  "weeklySessions" > 0
  AND (NOT "allowDoubleSession" OR "isMainSubject")
);

ALTER TABLE "ClassCurriculum"
ADD CONSTRAINT "ClassCurriculum_values_check"
CHECK (
  "weeklySessions" > 0
  AND (NOT "allowDoubleSession" OR "isMainSubject")
);

ALTER TABLE "ClassSection"
ADD CONSTRAINT "ClassSection_redesign_identity_check"
CHECK (
  ("gradeLevelId" IS NULL AND "sectionLabel" IS NULL)
  OR ("gradeLevelId" IS NOT NULL AND "sectionLabel" IS NOT NULL)
);
