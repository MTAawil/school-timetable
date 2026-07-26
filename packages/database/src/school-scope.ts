import type { PrismaClient } from "../generated/client/client";

export type SchoolScope = {
  schoolId: string;
  userId: string;
};

export function requireSchoolAccess(
  scope: SchoolScope,
  requestedSchoolId: string,
): void {
  if (scope.schoolId !== requestedSchoolId) {
    throw new Error("SCHOOL_ACCESS_DENIED");
  }
}

export function createSchoolRepositories(
  database: PrismaClient,
  scope: SchoolScope,
) {
  return {
    terms: {
      findById(termId: string) {
        return database.academicTerm.findFirst({
          where: {
            id: termId,
            schoolId: scope.schoolId,
            deletedAt: null,
          },
        });
      },
    },
    teachers: {
      listActive() {
        return database.teacher.findMany({
          where: {
            schoolId: scope.schoolId,
            isActive: true,
            deletedAt: null,
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        });
      },
    },
    subjects: {
      listActive() {
        return database.subject.findMany({
          where: {
            schoolId: scope.schoolId,
            isActive: true,
            deletedAt: null,
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        });
      },
    },
  };
}
