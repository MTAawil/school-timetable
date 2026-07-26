"use server";

import { getDatabase } from "@school-timetable/database";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";
import { softConstraints } from "@/lib/soft-constraints";

const weightSchema = z.coerce.number().int().min(0).max(1000);

export async function saveConstraintWeights(formData: FormData): Promise<void> {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  let profile = await db.constraintProfile.findFirst({
    where: { schoolId: user.schoolId, termId: term.id, isDefault: true },
  });
  if (!profile) {
    profile = await db.constraintProfile.create({
      data: {
        schoolId: user.schoolId,
        termId: term.id,
        name: "Balanced",
        isDefault: true,
      },
    });
  }

  await db.$transaction(
    softConstraints.map((constraint) => {
      const weight = weightSchema.parse(formData.get(constraint.code));
      return db.constraintWeight.upsert({
        where: {
          profileId_code: { profileId: profile.id, code: constraint.code },
        },
        update: { kind: "SOFT", isEnabled: weight > 0, weight },
        create: {
          profileId: profile.id,
          code: constraint.code,
          kind: "SOFT",
          isEnabled: weight > 0,
          weight,
        },
      });
    }),
  );
  revalidatePath("/settings/constraints");
  revalidatePath("/readiness");
}
