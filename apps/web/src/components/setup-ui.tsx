import { CirclePlus } from "lucide-react";

export function PageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-b border-[#dce1dc] pb-5">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-[#66706b]">{description}</p>
    </div>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold">
      <CirclePlus aria-hidden="true" size={17} className="text-[#0e6b4f]" />
      {children}
    </h2>
  );
}

export function EmptyRow({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-[#cfd5d1] bg-white px-5 py-8 text-center text-sm text-[#66706b]">
      {message}
    </div>
  );
}

export const inputClass =
  "h-10 w-full border border-[#cfd5d1] bg-white px-3 text-sm outline-none focus:border-[#0e6b4f] focus:ring-2 focus:ring-[#0e6b4f]/15";

export const buttonClass =
  "inline-flex h-10 items-center justify-center bg-[#0e6b4f] px-4 text-sm font-semibold text-white hover:bg-[#0b5b43]";
