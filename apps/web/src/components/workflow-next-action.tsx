import { ArrowRight } from "lucide-react";
import Link from "next/link";

export function WorkflowNextAction({
  description,
  href,
  label,
}: {
  description: string;
  href: string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 border-t border-[#dce1dc] pt-5 sm:flex-row sm:items-center">
      <p className="text-sm text-[#66706b]">{description}</p>
      <Link
        className="inline-flex h-10 shrink-0 items-center gap-2 bg-[#0e6b4f] px-4 text-sm font-semibold text-white hover:bg-[#0b5b43]"
        href={href}
      >
        {label}
        <ArrowRight aria-hidden="true" size={16} />
      </Link>
    </div>
  );
}
