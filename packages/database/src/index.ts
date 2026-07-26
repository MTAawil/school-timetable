import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/client/client";
export { Prisma } from "../generated/client/client";

const globalForDatabase = globalThis as typeof globalThis & {
  timetableDatabase?: PrismaClient;
};

export function getDatabase(): PrismaClient {
  if (globalForDatabase.timetableDatabase) {
    return globalForDatabase.timetableDatabase;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  if (process.env.NODE_ENV !== "production") {
    globalForDatabase.timetableDatabase = client;
  }

  return client;
}

export * from "./domain/availability";
export * from "./domain/calendar";
export * from "./domain/schedule-versioning";
export * from "./domain/readiness";
export * from "./domain/solver-snapshot";
export * from "./domain/teaching-requirement";
export * from "./school-scope";
