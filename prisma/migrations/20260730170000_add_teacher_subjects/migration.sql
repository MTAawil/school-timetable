-- CreateTable
CREATE TABLE "TeacherSubject" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherSubject_pkey" PRIMARY KEY ("id")
);

-- Preserve the subjects already evidenced by current teacher allocations.
INSERT INTO "TeacherSubject" ("id", "schoolId", "teacherId", "subjectId")
SELECT gen_random_uuid(), "schoolId", "teacherId", "subjectId"
FROM "ClassCurriculum"
WHERE "teacherId" IS NOT NULL
GROUP BY "schoolId", "teacherId", "subjectId";

-- CreateIndex
CREATE INDEX "TeacherSubject_schoolId_subjectId_idx" ON "TeacherSubject"("schoolId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSubject_schoolId_teacherId_subjectId_key" ON "TeacherSubject"("schoolId", "teacherId", "subjectId");

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_teacherId_schoolId_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "Teacher"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherSubject" ADD CONSTRAINT "TeacherSubject_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;
