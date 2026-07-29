import { hash } from "bcryptjs";

import { getDatabase } from "../packages/database/src/index";

const ids = {
  school: "10000000-0000-4000-8000-000000000001",
  term: "10000000-0000-4000-8000-000000000002",
  admin: "10000000-0000-4000-8000-000000000003",
} as const;

async function main(): Promise<void> {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must contain at least 12 characters.");
  }

  const db = getDatabase();
  const passwordHash = await hash(password, 12);

  await db.$transaction([
    db.school.create({
      data: {
        id: ids.school,
        name: "My School",
        timezone: "Asia/Beirut",
      },
    }),
    db.user.create({
      data: {
        id: ids.admin,
        schoolId: ids.school,
        email: "admin@example.test",
        name: "School Administrator",
        passwordHash,
      },
    }),
    db.academicTerm.create({
      data: {
        id: ids.term,
        schoolId: ids.school,
        name: "2026-2027",
        startsOn: new Date("2026-09-01T00:00:00.000Z"),
        endsOn: new Date("2027-06-30T00:00:00.000Z"),
        isActive: true,
        roomsEnabled: false,
      },
    }),
  ]);
}

main()
  .then(() => {
    console.log("Created an empty school for manual testing.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabase().$disconnect();
  });
