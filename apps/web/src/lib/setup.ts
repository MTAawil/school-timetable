import "server-only";

import { getDatabase } from "@school-timetable/database";

export async function getActiveTerm(schoolId: string) {
  const term = await getDatabase().academicTerm.findFirst({
    where: { schoolId, isActive: true, deletedAt: null },
    orderBy: { startsOn: "desc" },
  });
  if (!term) {
    throw new Error("ACTIVE_TERM_REQUIRED");
  }
  return term;
}

export function optionalText(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

export function optionalInteger(value: FormDataEntryValue | null) {
  const text = optionalText(value);
  return text === null ? null : Number(text);
}
