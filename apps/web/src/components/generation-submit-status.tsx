"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export function generationStageForElapsed(elapsedSeconds: number): string {
  if (elapsedSeconds < 2) {
    return "Preparing and validating timetable inputs";
  }
  if (elapsedSeconds < 5) {
    return "Starting the scheduling solver";
  }
  return "Solver is evaluating constraints and timetable options";
}

function GenerationProgressDialog({ title }: { title: string }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      aria-labelledby="generation-progress-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="dialog"
    >
      <div className="w-full max-w-lg border border-[#b8c0bb] bg-white p-6 shadow-xl">
        <div className="flex items-start gap-4">
          <LoaderCircle
            aria-hidden="true"
            className="mt-0.5 shrink-0 animate-spin text-[#0e6b4f]"
            size={24}
          />
          <div className="min-w-0 flex-1">
            <h2 id="generation-progress-title" className="font-semibold">
              {title}
            </h2>
            <p className="mt-2 text-sm font-medium text-[#36413c]">
              {generationStageForElapsed(elapsedSeconds)}
            </p>
            <div
              aria-label="Generation in progress"
              className="mt-4 h-2 overflow-hidden bg-[#e4e8e5]"
              role="progressbar"
            >
              <div className="generation-progress-indicator h-full w-1/3 bg-[#0e6b4f]" />
            </div>
            <div className="mt-3 flex items-center justify-between gap-4 text-xs text-[#66706b]">
              <span>Elapsed time: {elapsedSeconds} seconds</span>
              <span>Please keep this page open</span>
            </div>
            <p className="mt-4 border-t border-[#dce1dc] pt-3 text-xs leading-5 text-[#66706b]">
              The solver is respecting every hard rule. Completion time depends
              on the number of classes, teachers, restrictions, and requested
              alternatives.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GenerationSubmitStatus({
  label = "Generate timetable",
  pendingTitle = "Generating timetable",
}: {
  label?: string;
  pendingTitle?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <button
        className="mt-auto inline-flex h-10 items-center justify-center bg-[#0e6b4f] px-4 text-sm font-semibold text-white hover:bg-[#0b5b43] disabled:cursor-wait disabled:bg-[#66877b]"
        disabled={pending}
        type="submit"
      >
        {pending ? "Generating..." : label}
      </button>
      {pending ? <GenerationProgressDialog title={pendingTitle} /> : null}
    </>
  );
}
