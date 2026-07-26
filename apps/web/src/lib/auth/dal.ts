import "server-only";

import { getDatabase } from "@school-timetable/database";
import { cache } from "react";
import { redirect } from "next/navigation";

import { readSession } from "./session";

export const verifySession = cache(async () => {
  const session = await readSession();
  if (!session) {
    redirect("/login");
  }

  const user = await getDatabase().user.findFirst({
    where: {
      id: session.userId,
      schoolId: session.schoolId,
      role: "ADMIN",
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      schoolId: true,
      name: true,
      email: true,
      role: true,
      school: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  return user;
});
