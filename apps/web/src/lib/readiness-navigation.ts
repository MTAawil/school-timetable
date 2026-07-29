type ReadinessNavigationIssue = {
  code: string;
  entityIds: string[];
  suggestions: string[];
  required?: number;
  available?: number;
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
  if (
    issue.code === "TEACHER_WORKLOAD_MISMATCH" ||
    issue.code === "TEACHER_CAPACITY_SHORTAGE"
  ) {
    const teacherId = issue.entityIds[0];
    const teacher = teachers.find((item) => item.id === teacherId);
    if (teacherId && teacher) {
      const issueQuery =
        issue.code === "TEACHER_CAPACITY_SHORTAGE"
          ? `&issue=capacity&required=${encodeURIComponent(String(issue.required ?? ""))}&available=${encodeURIComponent(String(issue.available ?? ""))}`
          : "";
      return {
        href: `/teachers?teacher=${encodeURIComponent(teacherId)}${issueQuery}#teacher-editor`,
        label:
          issue.code === "TEACHER_CAPACITY_SHORTAGE"
            ? `Fix ${teacher.name}'s capacity`
            : `Edit ${teacher.name}`,
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
