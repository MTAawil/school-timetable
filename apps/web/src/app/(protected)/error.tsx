"use client";

import { RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="border border-[#e3b7b2] bg-white p-6">
      <h1 className="text-xl font-semibold">This page could not be loaded</h1>
      <p className="mt-2 text-sm text-[#66706b]">
        Check the submitted values and try again.
      </p>
      <button
        className="mt-5 inline-flex h-10 items-center bg-[#9d2e25] px-4 text-sm font-semibold text-white"
        onClick={reset}
      >
        <RotateCcw className="mr-2" size={16} />
        Try again
      </button>
    </div>
  );
}
