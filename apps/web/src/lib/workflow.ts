import { getDatabase } from "@school-timetable/database";

import { getActiveTerm } from "@/lib/setup";

export type WorkflowStep = {
  href: string;
  label: string;
  complete: boolean;
  optional?: boolean;
};

export async function getWorkflowSteps(
  schoolId: string,
): Promise<WorkflowStep[]> {
  const db = getDatabase();
  const term = await getActiveTerm(schoolId);
  const [configuration, classes, curriculum, teachers, successfulJob] =
    await Promise.all([
      db.schoolWeekConfiguration.findFirst({
        where: { schoolId, termId: term.id },
      }),
      db.classSection.findMany({
        where: {
          schoolId,
          termId: term.id,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      }),
      db.classCurriculum.findMany({
        where: {
          schoolId,
          termId: term.id,
          isActive: true,
          classSection: { isActive: true, deletedAt: null },
        },
        select: {
          classSectionId: true,
          teacherId: true,
          weeklySessions: true,
        },
      }),
      db.teacher.findMany({
        where: { schoolId, isActive: true, deletedAt: null },
        select: { id: true, weeklyTeachingSessions: true },
      }),
      db.generationJob.findFirst({
        where: {
          schoolId,
          termId: term.id,
          status: { in: ["FEASIBLE", "OPTIMAL"] },
        },
        select: { id: true },
      }),
    ]);

  const allocatedByTeacher = new Map<string, number>();
  for (const item of curriculum) {
    if (!item.teacherId) continue;
    allocatedByTeacher.set(
      item.teacherId,
      (allocatedByTeacher.get(item.teacherId) ?? 0) + item.weeklySessions,
    );
  }
  const teacherCoverageComplete =
    teachers.length > 0 &&
    curriculum.length > 0 &&
    curriculum.every((item) => item.teacherId !== null) &&
    teachers.every(
      (teacher) =>
        (allocatedByTeacher.get(teacher.id) ?? 0) ===
        teacher.weeklyTeachingSessions,
    );

  return [
    {
      href: "/setup",
      label: "School setup",
      complete: configuration !== null && classes.length > 0,
    },
    {
      href: "/subjects",
      label: "Curriculum",
      complete:
        curriculum.length > 0 &&
        classes.every((classSection) =>
          curriculum.some((item) => item.classSectionId === classSection.id),
        ),
    },
    {
      href: "/teachers",
      label: "Teachers",
      complete: teacherCoverageComplete,
    },
    {
      href: "/availability",
      label: "Restrictions",
      complete: teachers.length > 0,
      optional: true,
    },
    {
      href: "/readiness",
      label: "Generate",
      complete: successfulJob !== null,
    },
  ];
}
