"use server";

import {
  getDatabase,
  fingerprintSnapshot,
  type Prisma,
  solverSchemaVersion,
} from "@school-timetable/database";
import { redirect } from "next/navigation";
import { z } from "zod";

import { verifySession } from "@/lib/auth/dal";
import { getCurrentReadiness } from "@/lib/readiness";

const assignmentSchema = z.object({
  requirementId: z.string(),
  dayIndex: z.number().int().nonnegative(),
  periodIndex: z.number().int().nonnegative(),
  durationPeriods: z.number().int().positive(),
  roomId: z.string().nullable(),
});

const solveResponseSchema = z.object({
  schemaVersion: z.literal(2),
  jobId: z.string(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["FEASIBLE", "OPTIMAL", "INFEASIBLE", "FAILED"]),
  runtimeMs: z.number().int().nonnegative(),
  alternatives: z.array(
    z.object({
      rank: z.number().int().positive(),
      solverStatus: z.enum(["FEASIBLE", "OPTIMAL"]),
      totalPenalty: z.number().int().nonnegative(),
      diversityScore: z.number().int().nonnegative().nullable().optional(),
      penaltyBreakdown: z.record(z.string(), z.number().int()),
      assignments: z.array(assignmentSchema),
      runtimeMs: z.number().int().nonnegative(),
      warnings: z.array(z.string()),
    }),
  ),
  diagnostics: z.array(z.record(z.string(), z.unknown())),
  warnings: z.array(z.string()),
  variableCount: z.number().int().nonnegative(),
  constraintCount: z.number().int().nonnegative(),
});

const generationOptionsSchema = z.object({
  alternativeCount: z.coerce.number().int().min(1).max(5),
  maxQualityDegradationPercent: z.coerce.number().int().min(0).max(100),
  timeLimitSeconds: z.coerce.number().int().min(30).max(180),
});

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function generateTimetable(formData: FormData): Promise<void> {
  const user = await verifySession();
  const current = await getCurrentReadiness(user.schoolId);
  const selectedOptions = generationOptionsSchema.parse({
    alternativeCount: formData.get("alternativeCount"),
    maxQualityDegradationPercent: formData.get("maxQualityDegradationPercent"),
    timeLimitSeconds: formData.get("timeLimitSeconds"),
  });
  const snapshot = {
    ...current.snapshot,
    options: {
      ...current.snapshot.options,
      ...selectedOptions,
    },
  };
  const fingerprint = fingerprintSnapshot(snapshot);
  const { result } = current;
  if (!result.ready) {
    throw new Error("READINESS_VALIDATION_FAILED");
  }

  const db = getDatabase();
  const job = await db.generationJob.create({
    data: {
      schoolId: user.schoolId,
      termId: snapshot.term.id,
      constraintProfileId: snapshot.constraintProfile.id,
      status: "RUNNING",
      inputSnapshot: jsonValue(snapshot),
      inputFingerprint: fingerprint,
      solverSchemaVersion,
      options: jsonValue(snapshot.options),
      startedAt: new Date(),
    },
  });

  try {
    const baseUrl = process.env.SOLVER_BASE_URL ?? "http://127.0.0.1:8000";
    const timeoutSeconds = Math.max(
      Number(process.env.SOLVER_REQUEST_TIMEOUT_SECONDS ?? "40"),
      selectedOptions.timeLimitSeconds + 15,
    );
    const response = await fetch(`${baseUrl}/v1/solve`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.SOLVER_INTERNAL_TOKEN
          ? { "x-solver-token": process.env.SOLVER_INTERNAL_TOKEN }
          : {}),
      },
      body: JSON.stringify({ ...snapshot, jobId: job.id }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutSeconds * 1000),
    });
    if (!response.ok) {
      throw new Error(`SOLVER_HTTP_${String(response.status)}`);
    }
    const solverResult = solveResponseSchema.parse(await response.json());
    if (
      solverResult.jobId !== job.id ||
      solverResult.inputFingerprint !== fingerprint
    ) {
      throw new Error("SOLVER_RESPONSE_IDENTITY_MISMATCH");
    }

    await db.$transaction(async (transaction) => {
      if (solverResult.alternatives.length > 0) {
        await transaction.generationAlternative.createMany({
          data: solverResult.alternatives.map((alternative) => ({
            schoolId: user.schoolId,
            generationJobId: job.id,
            rank: alternative.rank,
            solverStatus: alternative.solverStatus,
            totalPenalty: alternative.totalPenalty,
            diversityScore: alternative.diversityScore ?? null,
            penaltyBreakdown: jsonValue(alternative.penaltyBreakdown),
            assignments: jsonValue(alternative.assignments),
            runtimeMs: alternative.runtimeMs,
            warnings: jsonValue(alternative.warnings),
          })),
        });
      }
      if (solverResult.diagnostics.length > 0) {
        await transaction.generationDiagnostic.createMany({
          data: solverResult.diagnostics.map((diagnostic, index) => ({
            schoolId: user.schoolId,
            generationJobId: job.id,
            code:
              typeof diagnostic.code === "string"
                ? diagnostic.code
                : `SOLVER_DIAGNOSTIC_${String(index + 1)}`,
            summary:
              typeof diagnostic.summary === "string"
                ? diagnostic.summary
                : "The solver reported a diagnostic.",
            details: jsonValue(diagnostic),
          })),
        });
      }
      await transaction.generationJob.update({
        where: { id: job.id },
        data: {
          status: solverResult.status,
          responseMetadata: jsonValue({
            runtimeMs: solverResult.runtimeMs,
            variableCount: solverResult.variableCount,
            constraintCount: solverResult.constraintCount,
            warnings: solverResult.warnings,
          }),
          completedAt: new Date(),
        },
      });
      await transaction.auditLog.create({
        data: {
          schoolId: user.schoolId,
          userId: user.id,
          action: "TIMETABLE_GENERATED",
          entityType: "GenerationJob",
          entityId: job.id,
          details: jsonValue({
            status: solverResult.status,
            alternativeCount: solverResult.alternatives.length,
            inputFingerprint: fingerprint,
          }),
        },
      });
    });
  } catch (error) {
    await db.generationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorCode: "SOLVER_REQUEST_FAILED",
        errorMessage:
          error instanceof Error
            ? error.message
            : "The solver request failed unexpectedly.",
        completedAt: new Date(),
      },
    });
  }

  redirect(`/generation/${job.id}`);
}
