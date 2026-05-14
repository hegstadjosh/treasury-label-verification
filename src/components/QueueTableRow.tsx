import type { BatchLabelEntry } from "@/lib/types";
import { VerdictBadge } from "./VerdictBadge";

export function QueueTableRow({
  entry,
  isSelected,
  onSelect,
}: {
  entry: BatchLabelEntry;
  isSelected: boolean;
  onSelect: (entry: BatchLabelEntry) => void;
}) {
  return (
    <tr
      onClick={() => onSelect(entry)}
      className={`cursor-pointer align-top transition-colors ${
        isSelected ? "bg-blue-50" : "hover:bg-slate-50"
      }`}
    >
      <td className="px-3 py-2 font-medium text-slate-900">
        <span
          className="block max-w-[14rem] truncate sm:max-w-[20rem]"
          title={entry.filename}
        >
          {entry.filename}
        </span>
      </td>
      <td className="px-3 py-2">
        <VerdictBadge verdict={entry.result.verdict} size="sm" />
      </td>
      <td className="px-3 py-2 text-slate-700">
        <span className="line-clamp-2">
          {entry.result.top_reason || (
            <span className="text-slate-400">-</span>
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(entry);
          }}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          View details
        </button>
      </td>
    </tr>
  );
}
