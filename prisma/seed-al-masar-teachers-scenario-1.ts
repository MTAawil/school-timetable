import { getDatabase } from "../packages/database/src/index";
import { seedTeacherScenario } from "./seed-al-masar-teacher-scenario";

seedTeacherScenario(1)
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getDatabase().$disconnect();
  });
