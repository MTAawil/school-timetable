import { getDatabase } from "@school-timetable/database";
import { Save } from "lucide-react";

import { saveConstraintWeights } from "@/app/(protected)/settings/constraints/actions";
import { PageHeading, buttonClass, inputClass } from "@/components/setup-ui";
import { verifySession } from "@/lib/auth/dal";
import { getActiveTerm } from "@/lib/setup";
import { softConstraints } from "@/lib/soft-constraints";

export default async function ConstraintSettingsPage() {
  const user = await verifySession();
  const term = await getActiveTerm(user.schoolId);
  const profile = await getDatabase().constraintProfile.findFirst({
    where: { schoolId: user.schoolId, termId: term.id, isDefault: true },
    include: { weights: true },
  });
  const weights = new Map(
    profile?.weights.map((weight) => [weight.code, weight.weight ?? 0]) ?? [],
  );

  return (
    <div className="space-y-7">
      <PageHeading
        title="Quality weights"
        description="Set the relative cost of each timetable preference. Use zero to disable a preference."
      />
      <form action={saveConstraintWeights} className="space-y-5">
        <div className="divide-y divide-[#dce1dc] border border-[#dce1dc] bg-white">
          {softConstraints.map((constraint) => (
            <div
              className="grid items-center gap-4 p-4 md:grid-cols-[1fr_120px]"
              key={constraint.code}
            >
              <div>
                <label className="font-medium" htmlFor={constraint.code}>
                  {constraint.label}
                </label>
                <p className="mt-1 text-sm text-[#66706b]">
                  {constraint.description}
                </p>
                <code className="mt-2 block text-xs text-[#8a928e]">
                  {constraint.code}
                </code>
              </div>
              <input
                aria-label={`${constraint.label} weight`}
                className={inputClass}
                defaultValue={
                  weights.get(constraint.code) ?? constraint.defaultWeight
                }
                id={constraint.code}
                max="1000"
                min="0"
                name={constraint.code}
                type="number"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button className={buttonClass} type="submit">
            <Save className="mr-2" size={16} />
            Save weights
          </button>
        </div>
      </form>
    </div>
  );
}
