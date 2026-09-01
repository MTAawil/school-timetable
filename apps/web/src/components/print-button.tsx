"use client";

import { FileDown } from "lucide-react";

export function PrintButton() {
  return (
    <button
      className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm print:hidden"
      onClick={() => window.print()}
      title="Open the browser dialog and choose Save as PDF"
      type="button"
    >
      <FileDown className="mr-2" size={16} />
      Save as PDF
    </button>
  );
}
