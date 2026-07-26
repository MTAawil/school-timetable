"use client";

import { useTransition } from "react";

import { previewMove } from "@/app/(protected)/schedules/actions";

export function DraggableAssignment({
  assignmentId,
  disabled = false,
  children,
}: {
  assignmentId: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/assignment-id", assignmentId);
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      {children}
    </div>
  );
}

export function ScheduleDropCell({
  scheduleId,
  dayIndex,
  periodIndex,
  disabled = false,
  children,
}: {
  scheduleId: string;
  dayIndex?: number;
  periodIndex?: number;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div
      className={`min-h-20 ${pending ? "opacity-50" : ""}`}
      onDragOver={(event) => {
        if (!disabled) event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (disabled) return;
        const assignmentId = event.dataTransfer.getData("text/assignment-id");
        if (!assignmentId) return;
        const formData = new FormData();
        formData.set("scheduleId", scheduleId);
        formData.set("assignmentId", assignmentId);
        if (dayIndex === undefined || periodIndex === undefined) {
          formData.set("target", "tray");
        } else {
          formData.set("target", "slot");
          formData.set("dayIndex", String(dayIndex));
          formData.set("periodIndex", String(periodIndex));
        }
        startTransition(async () => {
          await previewMove(formData);
        });
      }}
    >
      {children}
    </div>
  );
}
