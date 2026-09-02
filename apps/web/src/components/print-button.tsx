"use client";

import { Download, Printer } from "lucide-react";

type PrintButtonProps = {
  label?: string;
};

export function PrintButton({ label = "Print" }: PrintButtonProps) {
  const Icon = label.toLowerCase().includes("download") ? Download : Printer;

  return (
    <button
      className="inline-flex h-9 items-center border border-[#cfd5d1] bg-white px-3 text-sm print:hidden"
      onClick={() => window.print()}
      type="button"
    >
      <Icon className="mr-2" size={16} />
      {label}
    </button>
  );
}
