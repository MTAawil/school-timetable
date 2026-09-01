"use client";

import { ArrowRightLeft, LoaderCircle, X } from "lucide-react";
import { useState, useTransition } from "react";

import {
  findMoveOptions,
  moveAssignment,
  swapAssignments,
  type MoveOption,
} from "@/app/(protected)/schedules/actions";

type SlotLabel = {
  dayIndex: number;
  dayName: string;
  periodIndex: number;
  periodName: string;
};

export function ScheduleSessionMenu({
  assignmentId,
  disabled,
  label,
  locked = false,
  scheduleId,
  slots,
}: {
  assignmentId: string;
  disabled: boolean;
  label: React.ReactNode;
  locked?: boolean;
  scheduleId: string;
  slots: SlotLabel[];
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<MoveOption[] | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const labels = new Map(
    slots.map((slot) => [
      `${String(slot.dayIndex)}:${String(slot.periodIndex)}`,
      `${slot.dayName}, ${slot.periodName}`,
    ]),
  );

  function simulate() {
    const formData = new FormData();
    formData.set("scheduleId", scheduleId);
    formData.set("assignmentId", assignmentId);
    setError(undefined);
    startTransition(async () => {
      const result = await findMoveOptions(formData);
      setOptions(result.options);
      setError(result.error);
    });
  }

  return (
    <div className="relative">
      <button
        className={`block w-full border-l-2 px-2 py-1.5 text-left text-xs disabled:cursor-default ${
          locked
            ? "border-[#b42318] bg-[#fff0ee] text-[#7a1b14]"
            : "border-[#0e6b4f] bg-[#edf6f2]"
        }`}
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          setOptions(null);
          setError(undefined);
        }}
        type="button"
      >
        {label}
      </button>
      {open ? (
        <div
          aria-label="Move session"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4"
          role="dialog"
        >
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto border border-[#cfd5d1] bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Move session</h2>
                <div className="mt-1 text-sm text-[#66706b]">{label}</div>
              </div>
              <button
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center border border-[#cfd5d1]"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            {options === null && !pending ? (
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="h-10 border border-[#cfd5d1] px-4 text-sm font-semibold"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="inline-flex h-10 items-center bg-[#0e6b4f] px-4 text-sm font-semibold text-white"
                  onClick={simulate}
                  type="button"
                >
                  <ArrowRightLeft className="mr-2" size={16} />
                  Find move options
                </button>
              </div>
            ) : null}

            {pending ? (
              <div className="flex min-h-32 items-center justify-center text-sm text-[#56615c]">
                <LoaderCircle className="mr-2 animate-spin" size={18} />
                Checking valid moves and swaps...
              </div>
            ) : null}

            {error ? (
              <p className="mt-5 border border-[#e3b7b2] bg-[#fff5f4] p-3 text-sm text-[#8e2020]">
                Simulation could not run: {error}
              </p>
            ) : null}

            {options ? (
              <div className="mt-5 space-y-2">
                {options.length === 0 ? (
                  <p className="border border-[#dce1dc] p-3 text-sm text-[#66706b]">
                    No valid move or swap is available for this session.
                  </p>
                ) : (
                  options.map((option, index) => {
                    const action =
                      option.type === "swap" ? swapAssignments : moveAssignment;
                    const quality =
                      option.scoreDelta < 0
                        ? "Improves schedule"
                        : option.scoreDelta === 0
                          ? "No quality change"
                          : "Reduces preference quality";
                    return (
                      <form
                        action={action}
                        className="flex items-center gap-3 border border-[#dce1dc] p-3"
                        key={`${option.type}-${String(option.dayIndex)}-${String(option.periodIndex)}-${option.swapWithId ?? ""}`}
                      >
                        <input
                          name="scheduleId"
                          type="hidden"
                          value={scheduleId}
                        />
                        <input
                          name="assignmentId"
                          type="hidden"
                          value={assignmentId}
                        />
                        {option.type === "swap" ? (
                          <input
                            name="swapWithId"
                            type="hidden"
                            value={option.swapWithId}
                          />
                        ) : (
                          <>
                            <input name="target" type="hidden" value="slot" />
                            <input
                              name="dayIndex"
                              type="hidden"
                              value={option.dayIndex}
                            />
                            <input
                              name="periodIndex"
                              type="hidden"
                              value={option.periodIndex}
                            />
                          </>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {index === 0 ? "Recommended: " : ""}
                            {labels.get(
                              `${String(option.dayIndex)}:${String(option.periodIndex)}`,
                            )}
                          </p>
                          <p className="mt-1 text-xs text-[#66706b]">
                            {option.type === "swap"
                              ? `Swap with ${option.swapLabel}`
                              : "Move to this time"}
                          </p>
                          <p className="mt-1 text-xs font-medium">
                            {quality} ({option.scoreDelta > 0 ? "+" : ""}
                            {option.scoreDelta})
                          </p>
                        </div>
                        <button className="h-9 shrink-0 bg-[#0e6b4f] px-3 text-sm font-semibold text-white">
                          Apply
                        </button>
                      </form>
                    );
                  })
                )}
                <button
                  className="h-10 w-full border border-[#cfd5d1] text-sm font-semibold"
                  onClick={() => setOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
