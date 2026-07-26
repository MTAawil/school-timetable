export const errorCodes = {
  databaseUnavailable: "DATABASE_UNAVAILABLE",
  internalError: "INTERNAL_ERROR",
  solverUnavailable: "SOLVER_UNAVAILABLE",
  validationError: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
