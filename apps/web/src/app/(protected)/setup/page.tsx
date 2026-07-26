import { getDatabase } from "@school-timetable/database";
import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";

import { PageHeading } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";

export default async function SetupPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const db = getDatabase();
  const [teachers, subjects, classes, requirements] = await Promise.all([
    db.teacher.count({ where: { schoolId: user.schoolId, deletedAt: null } }),
    db.subject.count({ where: { schoolId: user.schoolId, deletedAt: null } }),
    db.classSection.count({
      where: { schoolId: user.schoolId, termId: term.id, deletedAt: null },
    }),
    db.teachingRequirement.count({
      where: { schoolId: user.schoolId, termId: term.id, deletedAt: null },
    }),
  ]);
  const steps = [
    [
      "Calendar",
      "/settings/calendar",
      true,
      "Confirm teaching days and periods.",
    ],
    ["Teachers", "/teachers", teachers > 0, `${teachers} configured`],
    ["Subjects", "/subjects", subjects > 0, `${subjects} configured`],
    ["Classes", "/classes", classes > 0, `${classes} configured`],
    [
      "Requirements",
      "/requirements",
      requirements > 0,
      `${requirements} configured`,
    ],
    [
      "Readiness",
      "/readiness",
      requirements > 0,
      "Validate all scheduling inputs",
    ],
  ] as const;

  return (
    <div className="space-y-7">
      <PageHeading
        title="School setup"
        description={`Complete the scheduling inputs for ${term.name}.`}
      />
      <div className="divide-y divide-[#dce1dc] border border-[#dce1dc] bg-white">
        {steps.map(([label, href, complete, detail], index) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 px-5 py-4 hover:bg-[#f7f8f6]"
          >
            {complete ? (
              <CheckCircle2 className="text-[#0e6b4f]" size={20} />
            ) : (
              <Circle className="text-[#8a928e]" size={20} />
            )}
            <span className="w-7 text-sm text-[#8a928e]">{index + 1}</span>
            <span className="flex-1 font-medium">{label}</span>
            <span className="text-sm text-[#66706b]">{detail}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
