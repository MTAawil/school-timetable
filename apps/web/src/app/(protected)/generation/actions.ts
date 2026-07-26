"use server";

import {
  getDatabase,
  type Prisma,
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
  const requirements = await db.teachingRequirement.findMany({
    where: {
      id: { in: requirementIds },
      schoolId: user.schoolId,
      termId: alternative.generationJob.termId,
    },
  });
  const requirementById = new Map(
    requirements.map((requirement) => [requirement.id, requirement]),
  );
  if (requirements.length !== requirementIds.length) {
    throw new Error("SCHEDULE_REQUIREMENT_NOT_FOUND");
  }

  const schedule = await db.$transaction(async (transaction) => {
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
        inputSnapshot: jsonValue(alternative.generationJob.inputSnapshot),
        inputFingerprint: alternative.generationJob.inputFingerprint,
      },
    });
    await transaction.scheduleAssignment.createMany({
      data: storedAssignments.map((assignment) => {
        const requirement = requirementById.get(assignment.requirementId);
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
