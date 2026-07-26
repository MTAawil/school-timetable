import { EmptyRow } from "@/components/setup-ui";

export function EntityTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <EmptyRow message={emptyMessage} />;
  }

  return (
    <div className="overflow-x-auto border border-[#dce1dc] bg-white">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead className="bg-[#f0f2ef] text-xs font-semibold uppercase text-[#66706b]">
          <tr>
            {headers.map((header) => (
              <th key={header} className="border-b border-[#dce1dc] px-4 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e7eae7]">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
