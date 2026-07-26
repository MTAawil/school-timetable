import { getDatabase } from "@school-timetable/database";

import { verifySession } from "@/lib/auth/dal";

export default async function DashboardPage() {
  const user = await verifySession();
  const db = getDatabase();
  const term = await db.academicTerm.findFirst({
    where: { schoolId: user.schoolId, isActive: true, deletedAt: null },
  });

  const [teachers, classes, subjects, requirements] = await Promise.all([
    db.teacher.count({ where: { schoolId: user.schoolId, deletedAt: null } }),
    db.classSection.count({
      where: { schoolId: user.schoolId, termId: term?.id, deletedAt: null },
    }),
    db.subject.count({ where: { schoolId: user.schoolId, deletedAt: null } }),
    db.teachingRequirement.count({
      where: { schoolId: user.schoolId, termId: term?.id, deletedAt: null },
    }),
  ]);

  return (
    <>
      <div>
        <p className="text-sm font-medium text-[#0e6b4f]">Overview</p>
        <h1 className="mt-1 text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-[#66706b]">
          {term ? `Active term: ${term.name}` : "No active academic term"}
        </p>
      </div>
      <dl className="mt-7 grid gap-px overflow-hidden border border-[#dce1dc] bg-[#dce1dc] sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Teachers", teachers],
          ["Classes", classes],
          ["Subjects", subjects],
          ["Requirements", requirements],
        ].map(([label, value]) => (
          <div key={label} className="bg-white px-5 py-5">
            <dt className="text-sm text-[#66706b]">{label}</dt>
            <dd className="mt-2 text-3xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
