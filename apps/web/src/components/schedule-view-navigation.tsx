import Link from "next/link";

type ViewType = "school" | "class" | "teacher" | "room";

export function ScheduleViewNavigation({
  scheduleId,
  view,
  entities,
  entityId,
}: {
  scheduleId: string;
  view: ViewType;
  entities: [string, string][];
  entityId?: string;
}) {
  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {(["school", "class", "teacher", "room"] as const).map((item) => (
          <Link
            className={`h-9 px-3 py-2 text-sm font-medium ${
              view === item
                ? "bg-[#132b24] text-white"
                : "border border-[#cfd5d1] bg-white"
            }`}
            href={`/schedules/${scheduleId}?view=${item}`}
            key={item}
          >
            {item === "school"
              ? "Whole school"
              : item === "teacher"
                ? "Teacher schedules"
                : `${item[0]!.toUpperCase()}${item.slice(1)} schedules`}
          </Link>
        ))}
      </div>

      {view === "school" ? (
        <p className="text-sm text-[#66706b]">
          Select <strong>Teacher schedules</strong> to see each teacher&apos;s
          individual weekly timetable.
        </p>
      ) : entities.length > 0 ? (
        <nav
          aria-label={`${view} schedules`}
          className="flex flex-wrap gap-2 border border-[#dce1dc] bg-white p-3"
        >
          {entities.map(([id, name]) => (
            <Link
              aria-current={id === entityId ? "page" : undefined}
              className={`px-3 py-2 text-sm font-medium ${
                id === entityId
                  ? "bg-[#e9f4ef] text-[#0e6b4f]"
                  : "border border-[#cfd5d1] hover:bg-[#f5f6f3]"
              }`}
              href={`/schedules/${scheduleId}?view=${view}&entity=${id}`}
              key={id}
            >
              {name}
            </Link>
          ))}
        </nav>
      ) : (
        <p className="text-sm text-[#66706b]">
          No {view} schedules are available in this timetable.
        </p>
      )}
    </div>
  );
}
