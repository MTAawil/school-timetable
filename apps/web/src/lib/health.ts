import { getDatabase } from "@school-timetable/database";
import type { HealthResponse } from "@school-timetable/shared";

type HealthDependencies = {
  pingDatabase: () => Promise<void>;
};

const defaultDependencies: HealthDependencies = {
  async pingDatabase() {
    await getDatabase().$queryRaw`SELECT 1`;
  },
};

export type ApplicationHealth = HealthResponse & {
  dependencies: {
    database: "ok" | "degraded";
  };
};

export async function readApplicationHealth(
  dependencies: HealthDependencies = defaultDependencies,
): Promise<ApplicationHealth> {
  try {
    await dependencies.pingDatabase();

    return {
      service: "web",
      status: "ok",
      version: "0.1.0",
      dependencies: {
        database: "ok",
      },
    };
  } catch {
    return {
      service: "web",
      status: "degraded",
      version: "0.1.0",
      dependencies: {
        database: "degraded",
      },
    };
  }
}
