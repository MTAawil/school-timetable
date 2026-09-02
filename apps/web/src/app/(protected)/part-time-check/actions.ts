"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import {
  buildPartTimeCheckSnapshot,
  recordPartTimeCheckAudit,
  solvePartTimeCheck,
  validatePartTimeCheckSnapshot,
} from "@/lib/part-time-check";
import { getCurrentReadiness } from "@/lib/readiness";

const optionsSchema = z.object({
  timeLimitSeconds: z.coerce.number().int().min(30).max(300),
});

export async function runPartTimeCheck(formData: FormData): Promise<void> {
  const user = await verifySession();
  const options = optionsSchema.parse({
    timeLimitSeconds: formData.get("timeLimitSeconds"),
  });
  const { snapshot: fullSnapshot } = await getCurrentReadiness(user.schoolId);
  const snapshot = buildPartTimeCheckSnapshot(
    fullSnapshot,
    options.timeLimitSeconds,
  );
  const readiness = validatePartTimeCheckSnapshot(snapshot);

  if (snapshot.requirements.length === 0) {
    redirect("/part-time-check?error=NO_PART_TIME_REQUIREMENTS");
  }
  if (!readiness.ready) {
    redirect("/part-time-check?error=PART_TIME_READINESS_BLOCKED");
  }

  let auditId: string;
  try {
    const result = await solvePartTimeCheck(snapshot);
    const audit = await recordPartTimeCheckAudit({
      schoolId: user.schoolId,
      userId: user.id,
      snapshot,
      result,
    });
    auditId = audit.id;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PART_TIME_CHECK_FAILED";
    redirect(`/part-time-check?error=${encodeURIComponent(message)}`);
  }

  redirect(`/part-time-check?result=${auditId}`);
}
