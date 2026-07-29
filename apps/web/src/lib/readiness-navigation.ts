type ReadinessNavigationIssue = {
  code: string;
  entityIds: string[];
  suggestions: string[];
};

type ReadinessTeacher = {
  id: string;
  name: string;
};

export function getReadinessIssueAction(
  issue: ReadinessNavigationIssue,
  teachers: ReadinessTeacher[],
  destinations: Record<string, string>,
): { href: string; label: string } {
  if (issue.code === "TEACHER_WORKLOAD_MISMATCH") {
    const teacherId = issue.entityIds[0];
    const teacher = teachers.find((item) => item.id === teacherId);
    if (teacherId && teacher) {
      return {
        href: `/teachers?teacher=${encodeURIComponent(teacherId)}`,
        label: `Edit ${teacher.name}`,
      };
    }
  }

  return {
    href:
      issue.suggestions.find((suggestion) => suggestion.startsWith("/")) ??
      destinations[issue.code] ??
      "/setup",
    label: "Review setup",
  };
}
