/*
  Warnings:

  - You are about to drop the `SystemHealthCheck` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME');

-- CreateEnum
CREATE TYPE "AvailabilityEntityType" AS ENUM ('TEACHER', 'CLASS_SECTION', 'ROOM');

-- CreateEnum
CREATE TYPE "AvailabilityState" AS ENUM ('AVAILABLE', 'PREFERRED', 'DISLIKED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "PreferredTimeBand" AS ENUM ('EARLY', 'NEUTRAL', 'LATE');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('STANDARD', 'LAB', 'COMPUTER_LAB', 'GYM', 'OTHER');

-- CreateEnum
CREATE TYPE "ConstraintKind" AS ENUM ('HARD', 'SOFT');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'FEASIBLE', 'OPTIMAL', 'INFEASIBLE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('GENERATED', 'MANUAL', 'FIXED');

-- DropTable
DROP TABLE "SystemHealthCheck";

-- CreateTable
CREATE TABLE "School" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Beirut',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "roomsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayDefinition" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodDefinition" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIME(0) NOT NULL,
    "endsAt" TIME(0) NOT NULL,
    "isTeaching" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeriodDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Slot" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minLessonsPerDay" INTEGER,
    "maxLessonsPerDay" INTEGER,
    "maxConsecutiveLessons" INTEGER,
    "maxWeeklyWorkload" INTEGER,
    "preferredFreeDayIndex" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "category" TEXT,
    "preferredTimeBand" "PreferredTimeBand" NOT NULL DEFAULT 'NEUTRAL',
    "defaultRoomType" "RoomType",
    "defaultMaxSessionsPerDay" INTEGER,
    "consecutivePeriodsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "consecutivePeriodsPreferred" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "type" "RoomType" NOT NULL DEFAULT 'STANDARD',
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSection" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "homeroomTeacherId" UUID,
    "fixedRoomId" UUID,
    "maxLessonsPerDay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ClassSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "entityType" "AvailabilityEntityType" NOT NULL,
    "entityId" UUID NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "periodIndex" INTEGER NOT NULL,
    "state" "AvailabilityState" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeachingRequirement" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "classSectionId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "weeklyOccurrences" INTEGER NOT NULL,
    "durationPeriods" INTEGER NOT NULL DEFAULT 1,
    "minOccurrencesPerDay" INTEGER NOT NULL DEFAULT 0,
    "maxOccurrencesPerDay" INTEGER NOT NULL DEFAULT 1,
    "minimumDistinctDays" INTEGER NOT NULL DEFAULT 1,
    "allowMultipleOccurrencesSameDay" BOOLEAN NOT NULL DEFAULT false,
    "requiredRoomId" UUID,
    "requiredRoomType" "RoomType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TeachingRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementFixedSlot" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "teachingRequirementId" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementFixedSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementForbiddenSlot" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "teachingRequirementId" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequirementForbiddenSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstraintProfile" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstraintProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstraintWeight" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ConstraintKind" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstraintWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "constraintProfileId" UUID,
    "status" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "inputSnapshot" JSONB NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "solverSchemaVersion" INTEGER NOT NULL,
    "applicationCommitSha" TEXT,
    "solverCommitSha" TEXT,
    "options" JSONB NOT NULL,
    "responseMetadata" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationAlternative" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "generationJobId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "solverStatus" "GenerationStatus" NOT NULL,
    "totalPenalty" INTEGER NOT NULL,
    "diversityScore" INTEGER,
    "penaltyBreakdown" JSONB NOT NULL,
    "assignments" JSONB NOT NULL,
    "runtimeMs" INTEGER NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationAlternative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationDiagnostic" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "generationJobId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationDiagnostic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "generationJobId" UUID,
    "generationAlternativeId" UUID,
    "parentScheduleId" UUID,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "inputSnapshot" JSONB NOT NULL,
    "inputFingerprint" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleAssignment" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "teachingRequirementId" UUID NOT NULL,
    "classSectionId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "startDayIndex" INTEGER NOT NULL,
    "startPeriodIndex" INTEGER NOT NULL,
    "durationPeriods" INTEGER NOT NULL,
    "roomId" UUID,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "source" "AssignmentSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "userId" UUID,
    "scheduleId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "School_deletedAt_idx" ON "School"("deletedAt");

-- CreateIndex
CREATE INDEX "User_schoolId_isActive_idx" ON "User"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "User_schoolId_email_key" ON "User"("schoolId", "email");

-- CreateIndex
CREATE INDEX "AcademicTerm_schoolId_isActive_idx" ON "AcademicTerm"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicTerm_schoolId_name_key" ON "AcademicTerm"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicTerm_id_schoolId_key" ON "AcademicTerm"("id", "schoolId");

-- CreateIndex
CREATE INDEX "DayDefinition_schoolId_termId_idx" ON "DayDefinition"("schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "DayDefinition_termId_dayIndex_key" ON "DayDefinition"("termId", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DayDefinition_termId_name_key" ON "DayDefinition"("termId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DayDefinition_id_termId_schoolId_key" ON "DayDefinition"("id", "termId", "schoolId");

-- CreateIndex
CREATE INDEX "PeriodDefinition_schoolId_termId_idx" ON "PeriodDefinition"("schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodDefinition_termId_periodIndex_key" ON "PeriodDefinition"("termId", "periodIndex");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodDefinition_termId_name_key" ON "PeriodDefinition"("termId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodDefinition_id_termId_schoolId_key" ON "PeriodDefinition"("id", "termId", "schoolId");

-- CreateIndex
CREATE INDEX "Slot_schoolId_termId_idx" ON "Slot"("schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_termId_dayIndex_periodIndex_key" ON "Slot"("termId", "dayIndex", "periodIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_termId_dayId_periodId_key" ON "Slot"("termId", "dayId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Slot_id_termId_schoolId_key" ON "Slot"("id", "termId", "schoolId");

-- CreateIndex
CREATE INDEX "Teacher_schoolId_isActive_idx" ON "Teacher"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_schoolId_shortCode_key" ON "Teacher"("schoolId", "shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "Teacher_id_schoolId_key" ON "Teacher"("id", "schoolId");

-- CreateIndex
CREATE INDEX "Subject_schoolId_isActive_idx" ON "Subject"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_schoolId_shortCode_key" ON "Subject"("schoolId", "shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_id_schoolId_key" ON "Subject"("id", "schoolId");

-- CreateIndex
CREATE INDEX "Room_schoolId_isActive_idx" ON "Room"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Room_schoolId_shortCode_key" ON "Room"("schoolId", "shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "Room_id_schoolId_key" ON "Room"("id", "schoolId");

-- CreateIndex
CREATE INDEX "ClassSection_schoolId_termId_isActive_idx" ON "ClassSection"("schoolId", "termId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSection_schoolId_termId_shortCode_key" ON "ClassSection"("schoolId", "termId", "shortCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSection_id_termId_schoolId_key" ON "ClassSection"("id", "termId", "schoolId");

-- CreateIndex
CREATE INDEX "AvailabilityRule_schoolId_termId_entityType_entityId_idx" ON "AvailabilityRule"("schoolId", "termId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityRule_termId_entityType_entityId_dayIndex_period_key" ON "AvailabilityRule"("termId", "entityType", "entityId", "dayIndex", "periodIndex");

-- CreateIndex
CREATE INDEX "TeachingRequirement_schoolId_termId_classSectionId_idx" ON "TeachingRequirement"("schoolId", "termId", "classSectionId");

-- CreateIndex
CREATE INDEX "TeachingRequirement_schoolId_termId_teacherId_idx" ON "TeachingRequirement"("schoolId", "termId", "teacherId");

-- CreateIndex
CREATE INDEX "TeachingRequirement_schoolId_termId_subjectId_idx" ON "TeachingRequirement"("schoolId", "termId", "subjectId");

-- CreateIndex
CREATE INDEX "RequirementFixedSlot_schoolId_termId_slotId_idx" ON "RequirementFixedSlot"("schoolId", "termId", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementFixedSlot_teachingRequirementId_slotId_key" ON "RequirementFixedSlot"("teachingRequirementId", "slotId");

-- CreateIndex
CREATE INDEX "RequirementForbiddenSlot_schoolId_termId_slotId_idx" ON "RequirementForbiddenSlot"("schoolId", "termId", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementForbiddenSlot_teachingRequirementId_slotId_key" ON "RequirementForbiddenSlot"("teachingRequirementId", "slotId");

-- CreateIndex
CREATE INDEX "ConstraintProfile_schoolId_termId_isDefault_idx" ON "ConstraintProfile"("schoolId", "termId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "ConstraintProfile_schoolId_termId_name_key" ON "ConstraintProfile"("schoolId", "termId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ConstraintProfile_id_schoolId_termId_key" ON "ConstraintProfile"("id", "schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "ConstraintWeight_profileId_code_key" ON "ConstraintWeight"("profileId", "code");

-- CreateIndex
CREATE INDEX "GenerationJob_schoolId_termId_status_idx" ON "GenerationJob"("schoolId", "termId", "status");

-- CreateIndex
CREATE INDEX "GenerationJob_inputFingerprint_idx" ON "GenerationJob"("inputFingerprint");

-- CreateIndex
CREATE INDEX "GenerationAlternative_schoolId_generationJobId_idx" ON "GenerationAlternative"("schoolId", "generationJobId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationAlternative_generationJobId_rank_key" ON "GenerationAlternative"("generationJobId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationAlternative_id_schoolId_key" ON "GenerationAlternative"("id", "schoolId");

-- CreateIndex
CREATE INDEX "GenerationDiagnostic_schoolId_generationJobId_code_idx" ON "GenerationDiagnostic"("schoolId", "generationJobId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_generationAlternativeId_key" ON "Schedule"("generationAlternativeId");

-- CreateIndex
CREATE INDEX "Schedule_schoolId_termId_status_idx" ON "Schedule"("schoolId", "termId", "status");

-- CreateIndex
CREATE INDEX "Schedule_parentScheduleId_idx" ON "Schedule"("parentScheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_schoolId_termId_version_key" ON "Schedule"("schoolId", "termId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_id_schoolId_termId_key" ON "Schedule"("id", "schoolId", "termId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_generationAlternativeId_schoolId_key" ON "Schedule"("generationAlternativeId", "schoolId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_schoolId_termId_scheduleId_idx" ON "ScheduleAssignment"("schoolId", "termId", "scheduleId");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_scheduleId_startDayIndex_startPeriodInde_idx" ON "ScheduleAssignment"("scheduleId", "startDayIndex", "startPeriodIndex");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_teacherId_startDayIndex_startPeriodIndex_idx" ON "ScheduleAssignment"("teacherId", "startDayIndex", "startPeriodIndex");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_classSectionId_startDayIndex_startPeriod_idx" ON "ScheduleAssignment"("classSectionId", "startDayIndex", "startPeriodIndex");

-- CreateIndex
CREATE INDEX "ScheduleAssignment_roomId_startDayIndex_startPeriodIndex_idx" ON "ScheduleAssignment"("roomId", "startDayIndex", "startPeriodIndex");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "AuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_scheduleId_createdAt_idx" ON "AuditLog"("scheduleId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayDefinition" ADD CONSTRAINT "DayDefinition_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodDefinition" ADD CONSTRAINT "PeriodDefinition_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_dayId_termId_schoolId_fkey" FOREIGN KEY ("dayId", "termId", "schoolId") REFERENCES "DayDefinition"("id", "termId", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Slot" ADD CONSTRAINT "Slot_periodId_termId_schoolId_fkey" FOREIGN KEY ("periodId", "termId", "schoolId") REFERENCES "PeriodDefinition"("id", "termId", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_homeroomTeacherId_schoolId_fkey" FOREIGN KEY ("homeroomTeacherId", "schoolId") REFERENCES "Teacher"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSection" ADD CONSTRAINT "ClassSection_fixedRoomId_schoolId_fkey" FOREIGN KEY ("fixedRoomId", "schoolId") REFERENCES "Room"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingRequirement" ADD CONSTRAINT "TeachingRequirement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingRequirement" ADD CONSTRAINT "TeachingRequirement_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingRequirement" ADD CONSTRAINT "TeachingRequirement_classSectionId_termId_schoolId_fkey" FOREIGN KEY ("classSectionId", "termId", "schoolId") REFERENCES "ClassSection"("id", "termId", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingRequirement" ADD CONSTRAINT "TeachingRequirement_subjectId_schoolId_fkey" FOREIGN KEY ("subjectId", "schoolId") REFERENCES "Subject"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingRequirement" ADD CONSTRAINT "TeachingRequirement_teacherId_schoolId_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "Teacher"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingRequirement" ADD CONSTRAINT "TeachingRequirement_requiredRoomId_schoolId_fkey" FOREIGN KEY ("requiredRoomId", "schoolId") REFERENCES "Room"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementFixedSlot" ADD CONSTRAINT "RequirementFixedSlot_teachingRequirementId_fkey" FOREIGN KEY ("teachingRequirementId") REFERENCES "TeachingRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementFixedSlot" ADD CONSTRAINT "RequirementFixedSlot_slotId_termId_schoolId_fkey" FOREIGN KEY ("slotId", "termId", "schoolId") REFERENCES "Slot"("id", "termId", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementForbiddenSlot" ADD CONSTRAINT "RequirementForbiddenSlot_teachingRequirementId_fkey" FOREIGN KEY ("teachingRequirementId") REFERENCES "TeachingRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementForbiddenSlot" ADD CONSTRAINT "RequirementForbiddenSlot_slotId_termId_schoolId_fkey" FOREIGN KEY ("slotId", "termId", "schoolId") REFERENCES "Slot"("id", "termId", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstraintProfile" ADD CONSTRAINT "ConstraintProfile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstraintProfile" ADD CONSTRAINT "ConstraintProfile_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstraintWeight" ADD CONSTRAINT "ConstraintWeight_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ConstraintProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_constraintProfileId_schoolId_termId_fkey" FOREIGN KEY ("constraintProfileId", "schoolId", "termId") REFERENCES "ConstraintProfile"("id", "schoolId", "termId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationAlternative" ADD CONSTRAINT "GenerationAlternative_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationAlternative" ADD CONSTRAINT "GenerationAlternative_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationDiagnostic" ADD CONSTRAINT "GenerationDiagnostic_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationDiagnostic" ADD CONSTRAINT "GenerationDiagnostic_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_termId_schoolId_fkey" FOREIGN KEY ("termId", "schoolId") REFERENCES "AcademicTerm"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_generationAlternativeId_schoolId_fkey" FOREIGN KEY ("generationAlternativeId", "schoolId") REFERENCES "GenerationAlternative"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_parentScheduleId_fkey" FOREIGN KEY ("parentScheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleId_schoolId_termId_fkey" FOREIGN KEY ("scheduleId", "schoolId", "termId") REFERENCES "Schedule"("id", "schoolId", "termId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_teachingRequirementId_fkey" FOREIGN KEY ("teachingRequirementId") REFERENCES "TeachingRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_classSectionId_termId_schoolId_fkey" FOREIGN KEY ("classSectionId", "termId", "schoolId") REFERENCES "ClassSection"("id", "termId", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_teacherId_schoolId_fkey" FOREIGN KEY ("teacherId", "schoolId") REFERENCES "Teacher"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_roomId_schoolId_fkey" FOREIGN KEY ("roomId", "schoolId") REFERENCES "Room"("id", "schoolId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain checks
ALTER TABLE "AcademicTerm"
ADD CONSTRAINT "AcademicTerm_date_range_check"
CHECK ("startsOn" <= "endsOn");

ALTER TABLE "DayDefinition"
ADD CONSTRAINT "DayDefinition_day_index_check"
CHECK ("dayIndex" BETWEEN 0 AND 6);

ALTER TABLE "PeriodDefinition"
ADD CONSTRAINT "PeriodDefinition_index_and_time_check"
CHECK ("periodIndex" >= 0 AND "startsAt" < "endsAt");

ALTER TABLE "Slot"
ADD CONSTRAINT "Slot_indices_check"
CHECK ("dayIndex" BETWEEN 0 AND 6 AND "periodIndex" >= 0);

ALTER TABLE "Teacher"
ADD CONSTRAINT "Teacher_workload_check"
CHECK (
  ("minLessonsPerDay" IS NULL OR "minLessonsPerDay" >= 0)
  AND ("maxLessonsPerDay" IS NULL OR "maxLessonsPerDay" > 0)
  AND (
    "minLessonsPerDay" IS NULL
    OR "maxLessonsPerDay" IS NULL
    OR "minLessonsPerDay" <= "maxLessonsPerDay"
  )
  AND ("maxConsecutiveLessons" IS NULL OR "maxConsecutiveLessons" > 0)
  AND ("maxWeeklyWorkload" IS NULL OR "maxWeeklyWorkload" > 0)
  AND ("preferredFreeDayIndex" IS NULL OR "preferredFreeDayIndex" BETWEEN 0 AND 6)
);

ALTER TABLE "Subject"
ADD CONSTRAINT "Subject_defaults_check"
CHECK (
  "defaultMaxSessionsPerDay" IS NULL
  OR "defaultMaxSessionsPerDay" > 0
);

ALTER TABLE "Room"
ADD CONSTRAINT "Room_capacity_check"
CHECK ("capacity" IS NULL OR "capacity" > 0);

ALTER TABLE "ClassSection"
ADD CONSTRAINT "ClassSection_daily_limit_check"
CHECK ("maxLessonsPerDay" IS NULL OR "maxLessonsPerDay" > 0);

ALTER TABLE "AvailabilityRule"
ADD CONSTRAINT "AvailabilityRule_indices_check"
CHECK ("dayIndex" BETWEEN 0 AND 6 AND "periodIndex" >= 0);

ALTER TABLE "TeachingRequirement"
ADD CONSTRAINT "TeachingRequirement_counts_check"
CHECK (
  "weeklyOccurrences" > 0
  AND "durationPeriods" > 0
  AND "minOccurrencesPerDay" >= 0
  AND "maxOccurrencesPerDay" > 0
  AND "minOccurrencesPerDay" <= "maxOccurrencesPerDay"
  AND "minimumDistinctDays" > 0
  AND "minimumDistinctDays" <= "weeklyOccurrences"
);

ALTER TABLE "ConstraintWeight"
ADD CONSTRAINT "ConstraintWeight_kind_weight_check"
CHECK (
  ("kind" = 'HARD' AND "weight" IS NULL)
  OR ("kind" = 'SOFT' AND "weight" IS NOT NULL AND "weight" >= 0)
);

ALTER TABLE "GenerationJob"
ADD CONSTRAINT "GenerationJob_schema_version_check"
CHECK ("solverSchemaVersion" > 0);

ALTER TABLE "GenerationAlternative"
ADD CONSTRAINT "GenerationAlternative_metrics_check"
CHECK (
  "rank" > 0
  AND "totalPenalty" >= 0
  AND ("diversityScore" IS NULL OR "diversityScore" >= 0)
  AND "runtimeMs" >= 0
);

ALTER TABLE "Schedule"
ADD CONSTRAINT "Schedule_version_and_publish_check"
CHECK (
  "version" > 0
  AND (
    ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL)
    OR ("status" <> 'PUBLISHED')
  )
);

ALTER TABLE "ScheduleAssignment"
ADD CONSTRAINT "ScheduleAssignment_position_check"
CHECK (
  "startDayIndex" BETWEEN 0 AND 6
  AND "startPeriodIndex" >= 0
  AND "durationPeriods" > 0
);
