"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      <Printer className="mr-2" size={16} />
      Print
    </button>
  );
}
