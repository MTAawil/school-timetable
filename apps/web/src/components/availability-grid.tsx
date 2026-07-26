export type GridDay = { dayIndex: number; name: string };
export type GridPeriod = {
  periodIndex: number;
  name: string;
  isTeaching: boolean;
};

export function AvailabilityGrid({
  days,
  periods,
  unavailable,
}: {
  days: GridDay[];
  periods: GridPeriod[];
  unavailable: Set<string>;
}) {
  return (
    <div className="overflow-x-auto border border-[#dce1dc] bg-white">
      <table className="w-full min-w-[680px] border-collapse text-center text-sm">
        <thead>
          <tr className="bg-[#f0f2ef]">
            <th className="border-b border-r border-[#dce1dc] px-4 py-3 text-left">
              Period
            </th>
            {days.map((day) => (
              <th
                key={day.dayIndex}
                className="border-b border-[#dce1dc] px-4 py-3"
              >
                {day.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr
              key={period.periodIndex}
              className="border-b border-[#e7eae7] last:border-0"
            >
              <th className="border-r border-[#dce1dc] px-4 py-3 text-left font-medium">
                {period.name}
              </th>
              {days.map((day) => {
                const key = `${day.dayIndex}:${period.periodIndex}`;
                return (
                  <td key={key} className="px-4 py-3">
                    {period.isTeaching ? (
                      <input
                        aria-label={`${day.name}, ${period.name} unavailable`}
                        className="h-5 w-5 accent-[#b42318]"
                        defaultChecked={unavailable.has(key)}
                        name={`slot:${key}`}
                        type="checkbox"
                      />
                    ) : (
                      <span className="text-xs text-[#8a928e]">Break</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
