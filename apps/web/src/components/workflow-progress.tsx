import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";

import type { WorkflowStep } from "@/lib/workflow";

export function WorkflowProgress({ steps }: { steps: WorkflowStep[] }) {
  const completed = steps.filter((step) => step.complete).length;

  return (
    <section
      aria-label="Setup progress"
      className="border-b border-[#dce1dc] bg-white"
    >
      <div className="mx-auto max-w-7xl px-5 py-3 lg:px-8">
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase text-[#56615c]">
            Setup progress
          </p>
          <p className="text-xs text-[#66706b]">
            {completed} of {steps.length} complete
          </p>
        </div>
        <ol className="flex overflow-x-auto border border-[#dce1dc] bg-[#f8f9f7]">
          {steps.map((step, index) => (
            <li className="flex min-w-fit flex-1 items-center" key={step.href}>
              <Link
                className="flex h-11 flex-1 items-center gap-2 px-3 text-xs font-semibold hover:bg-white"
                href={step.href}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center border ${
                    step.complete
                      ? "border-[#0e6b4f] bg-[#0e6b4f] text-white"
                      : "border-[#aeb7b2] bg-white text-[#56615c]"
                  }`}
                >
                  {step.complete ? (
                    <Check aria-hidden="true" size={13} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{step.label}</span>
                {step.optional ? (
                  <span className="font-normal text-[#7b8580]">Optional</span>
                ) : null}
              </Link>
              {index < steps.length - 1 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="shrink-0 text-[#aeb7b2]"
                  size={14}
                />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
