import { ArrowRight, CalendarRange, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";
import { getWorkflowSteps } from "@/lib/workflow";
import { getDatabase } from "@school-timetable/database";

export default async function DashboardPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [steps, teachers, classes, curriculum, latestSchedule] =
    await Promise.all([
      getWorkflowSteps(user.schoolId),
      db.teacher.count({
        where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
      }),
      db.classSection.count({
        where: {
          schoolId: user.schoolId,
          termId: term.id,
          isActive: true,
          deletedAt: null,
        },
      }),
      db.classCurriculum.count({
        where: { schoolId: user.schoolId, termId: term.id, isActive: true },
      }),
      db.schedule.findFirst({
        where: { schoolId: user.schoolId, termId: term.id },
        select: { id: true, version: true, status: true, updatedAt: true },
        orderBy: { version: "desc" },
      }),
    ]);
  const nextStep = steps.find((step) => !step.complete) ?? steps.at(-1);

  return (
    <div className="space-y-7">
      <PageHeading
        title="Timetable overview"
        description={`Prepare and manage the weekly timetable for ${term.name}.`}
      />

      <section className="grid gap-px border border-[#dce1dc] bg-[#dce1dc] sm:grid-cols-3">
        {[
          ["Classes", classes],
          ["Class subjects", curriculum],
          ["Teachers", teachers],
        ].map(([label, value]) => (
          <div className="bg-white p-5" key={label}>
            <p className="text-sm text-[#66706b]">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="workflow-heading">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-semibold" id="workflow-heading">
                Setup workflow
              </h2>
              <p className="mt-1 text-sm text-[#66706b]">
                Complete these steps in order before generating.
              </p>
            </div>
            {nextStep ? (
              <Link
                className="inline-flex h-9 items-center gap-2 bg-[#0e6b4f] px-3 text-sm font-semibold text-white hover:bg-[#0b5b43]"
                href={nextStep.href}
              >
                Continue
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            ) : null}
          </div>
          <ol className="divide-y divide-[#dce1dc] border border-[#dce1dc] bg-white">
            {steps.map((step, index) => (
              <li key={step.href}>
                <Link
                  className="flex min-h-14 items-center gap-3 px-4 hover:bg-[#f8f9f7]"
                  href={step.href}
                >
                  {step.complete ? (
                    <CheckCircle2
                      aria-hidden="true"
                      className="text-[#0e6b4f]"
                      size={19}
                    />
                  ) : (
                    <Circle
                      aria-hidden="true"
                      className="text-[#8a948f]"
                      size={19}
                    />
                  )}
                  <span className="flex-1 text-sm font-semibold">
                    {index + 1}. {step.label}
                  </span>
                  {step.optional ? (
                    <span className="text-xs text-[#66706b]">Optional</span>
                  ) : null}
                  <ArrowRight
                    aria-hidden="true"
                    className="text-[#8a948f]"
                    size={16}
                  />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="latest-heading">
          <h2 className="font-semibold" id="latest-heading">
            Latest timetable
          </h2>
          {latestSchedule ? (
            <div className="mt-3 border border-[#dce1dc] bg-white p-5">
              <div className="flex items-center gap-3">
                <CalendarRange
                  aria-hidden="true"
                  className="text-[#0e6b4f]"
                  size={20}
                />
                <div>
                  <p className="font-semibold">
                    Version {latestSchedule.version}
                  </p>
                  <p className="mt-0.5 text-xs uppercase text-[#66706b]">
                    {latestSchedule.status.toLowerCase()}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm text-[#66706b]">
                Updated {latestSchedule.updatedAt.toLocaleString()}
              </p>
              <Link
                className="mt-4 inline-flex h-9 items-center gap-2 border border-[#9ba59f] px-3 text-sm font-semibold hover:bg-[#f0f2ef]"
                href={`/schedules/${latestSchedule.id}`}
              >
                Open timetable
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          ) : (
            <div className="mt-3 border border-dashed border-[#cfd5d1] bg-white p-5 text-sm text-[#66706b]">
              No timetable has been opened yet. Complete setup and generate an
              alternative.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
