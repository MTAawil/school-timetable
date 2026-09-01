-- AlterTable
ALTER TABLE "ClassCurriculum" ADD COLUMN     "sharedTeachingGroupId" UUID;

-- AlterTable
ALTER TABLE "ClassSection" ADD COLUMN     "recessAfterSession" INTEGER;

-- CreateTable
CREATE TABLE "SharedTeachingGroup" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "weeklySessions" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedTeachingGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedTeachingGroup_schoolId_termId_teacherId_idx" ON "SharedTeachingGroup"("schoolId", "termId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedTeachingGroup_schoolId_termId_subjectId_teacherId_key" ON "SharedTeachingGroup"("schoolId", "termId", "subjectId", "teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedTeachingGroup_id_schoolId_termId_key" ON "SharedTeachingGroup"("id", "schoolId", "termId");

-- CreateIndex
CREATE INDEX "ClassSection_schoolId_termId_recessAfterSession_idx" ON "ClassSection"("schoolId", "termId", "recessAfterSession");

-- AddForeignKey
ALTER TABLE "ClassCurriculum" ADD CONSTRAINT "ClassCurriculum_sharedTeachingGroupId_fkey" FOREIGN KEY ("sharedTeachingGroupId") REFERENCES "SharedTeachingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedTeachingGroup" ADD CONSTRAINT "SharedTeachingGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedTeachingGroup" ADD CONSTRAINT "SharedTeachingGroup_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedTeachingGroup" ADD CONSTRAINT "SharedTeachingGroup_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedTeachingGroup" ADD CONSTRAINT "SharedTeachingGroup_teacherId_schoolId_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "Teacher"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;
