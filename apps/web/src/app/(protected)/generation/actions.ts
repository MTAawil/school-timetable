"use server";

import {
  fingerprintSnapshot,
  getDatabase,
  type Prisma,
  type SolverSnapshot,
  type SupervisorSolverSnapshot,
} from "@school-timetable/database";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";

type StoredAssignment = {
  requirementId: string;
  dayIndex: number;
  periodIndex: number;
  durationPeriods: number;
  roomId: string | null;
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function remapSupervisorSnapshot(
  snapshot: SupervisorSolverSnapshot,
  requirementIds: Map<string, string>,
): SupervisorSolverSnapshot {
  const remap = (requirementId: string) => {
    const mapped = requirementIds.get(requirementId);
    if (!mapped) throw new Error("SCHEDULE_REQUIREMENT_NOT_FOUND");
    return mapped;
  };
  return {
    ...snapshot,
    requirements: snapshot.requirements.map((requirement) => ({
      ...requirement,
      id: remap(requirement.id),
    })),
    lockedAssignments: snapshot.lockedAssignments.map((assignment) => ({
      ...assignment,
      requirementId: remap(assignment.requirementId),
    })),
    existingAssignments: snapshot.existingAssignments.map((assignment) => ({
      ...assignment,
      requirementId: remap(assignment.requirementId),
    })),
  };
}

export async function openAlternativeAsDraft(
  formData: FormData,
): Promise<void> {
  const user = await verifySession();
  const alternativeId = z.uuid().parse(formData.get("alternativeId"));
  const db = getDatabase();
  const alternative = await db.generationAlternative.findFirst({
    where: { id: alternativeId, schoolId: user.schoolId },
    include: { schedule: true, generationJob: true },
  });
  if (!alternative) throw new Error("ALTERNATIVE_NOT_FOUND");
  if (alternative.schedule) {
    redirect(`/schedules/${alternative.schedule.id}`);
  }

  const storedAssignments = alternative.assignments as StoredAssignment[];
  const requirementIds = [
    ...new Set(storedAssignments.map((item) => item.requirementId)),
  ];
  const originalSnapshot = alternative.generationJob
    .inputSnapshot as unknown as SolverSnapshot;

  const schedule = await db.$transaction(async (transaction) => {
    const requirementBySolverId = new Map<
      string,
      { id: string; classSectionId: string; teacherId: string }
    >();
    let scheduleSnapshot = originalSnapshot;
    if (originalSnapshot.schemaVersion === 1) {
      const requirements = await transaction.teachingRequirement.findMany({
        where: {
          id: { in: requirementIds },
          schoolId: user.schoolId,
          termId: alternative.generationJob.termId,
        },
      });
      for (const requirement of requirements) {
        requirementBySolverId.set(requirement.id, requirement);
      }
    } else {
      const curricula = await transaction.classCurriculum.findMany({
        where: {
          id: { in: requirementIds },
          schoolId: user.schoolId,
          termId: alternative.generationJob.termId,
          isActive: true,
          teacherId: { not: null },
        },
      });
      for (const curriculum of curricula) {
        if (!curriculum.teacherId) continue;
        const compatibility = await transaction.teachingRequirement.create({
          data: {
            schoolId: user.schoolId,
            termId: alternative.generationJob.termId,
            classSectionId: curriculum.classSectionId,
            subjectId: curriculum.subjectId,
            teacherId: curriculum.teacherId,
            weeklyOccurrences: curriculum.weeklySessions,
            durationPeriods: 1,
            minOccurrencesPerDay: 0,
            maxOccurrencesPerDay:
              curriculum.isMainSubject && curriculum.allowDoubleSession ? 2 : 1,
            minimumDistinctDays:
              curriculum.isMainSubject && curriculum.allowDoubleSession
                ? Math.ceil(curriculum.weeklySessions / 2)
                : curriculum.weeklySessions,
            allowMultipleOccurrencesSameDay:
              curriculum.isMainSubject && curriculum.allowDoubleSession,
            isActive: false,
            notes: "Version-2 schedule compatibility record.",
          },
        });
        requirementBySolverId.set(curriculum.id, compatibility);
      }
      const remappedIds = new Map(
        Array.from(requirementBySolverId, ([solverId, requirement]) => [
          solverId,
          requirement.id,
        ]),
      );
      scheduleSnapshot = remapSupervisorSnapshot(originalSnapshot, remappedIds);
    }
    if (requirementBySolverId.size !== requirementIds.length) {
      throw new Error("SCHEDULE_REQUIREMENT_NOT_FOUND");
    }

    const latest = await transaction.schedule.findFirst({
      where: {
        schoolId: user.schoolId,
        termId: alternative.generationJob.termId,
      },
      orderBy: { version: "desc" },
    });
    const created = await transaction.schedule.create({
      data: {
        schoolId: user.schoolId,
        termId: alternative.generationJob.termId,
        generationJobId: alternative.generationJobId,
        generationAlternativeId: alternative.id,
        name: `Generated alternative ${String(alternative.rank)}`,
        version: (latest?.version ?? 0) + 1,
        status: "DRAFT",
        inputSnapshot: jsonValue(scheduleSnapshot),
        inputFingerprint: fingerprintSnapshot(scheduleSnapshot),
      },
    });
    await transaction.scheduleAssignment.createMany({
      data: storedAssignments.map((assignment) => {
        const requirement = requirementBySolverId.get(assignment.requirementId);
        if (!requirement) throw new Error("SCHEDULE_REQUIREMENT_NOT_FOUND");
        return {
          schoolId: user.schoolId,
          termId: alternative.generationJob.termId,
          scheduleId: created.id,
          teachingRequirementId: requirement.id,
          classSectionId: requirement.classSectionId,
          teacherId: requirement.teacherId,
          startDayIndex: assignment.dayIndex,
          startPeriodIndex: assignment.periodIndex,
          durationPeriods: assignment.durationPeriods,
          roomId: assignment.roomId,
          isLocked: false,
          source: "GENERATED" as const,
        };
      }),
    });
    return created;
  });
  redirect(`/schedules/${schedule.id}`);
}
