"use client";

import type { BatchSummary, LabelVerdict } from "@/lib/types";

/** `null` means "show everything"; otherwise filter to that single verdict. */
export type VerdictFilter = LabelVerdict | null;

interface TileSpec {
  verdict: LabelVerdict;
  label: string;
  count: number;
  /** Tailwind classes for the tile face when NOT active. */
  base: string;
  /** Tailwind classes for the tile face when active (clicked). */
  active: string;
  /** Color of the big numeric. */
  number: string;
}

export function OverviewTiles({
  summary,
  filter,
  onFilterChange,
}: {
  summary: BatchSummary;
  filter: VerdictFilter;
  onFilterChange: (next: VerdictFilter) => void;
}) {
  const tiles: TileSpec[] = [
    {
      verdict: "Pass",
      label: "Pass",
      count: summary.pass,
      base: "border-emerald-200 bg-emerald-50 hover:border-emerald-400",
      active: "border-emerald-500 bg-emerald-100 ring-2 ring-emerald-300",
      number: "text-emerald-700",
    },
    {
      verdict: "Needs Review",
      label: "Needs Review",
      count: summary.needs_review,
      base: "border-amber-200 bg-amber-50 hover:border-amber-400",
      active: "border-amber-500 bg-amber-100 ring-2 ring-amber-300",
      number: "text-amber-700",
    },
    {
      verdict: "Fail",
      label: "Fail",
      count: summary.fail,
      base: "border-rose-200 bg-rose-50 hover:border-rose-400",
      active: "border-rose-500 bg-rose-100 ring-2 ring-rose-300",
      number: "text-rose-700",
    },
    {
      verdict: "Unreadable",
      label: "Unreadable",
      count: summary.unreadable,
      base: "border-slate-200 bg-slate-50 hover:border-slate-400",
      active: "border-slate-500 bg-slate-100 ring-2 ring-slate-300",
      number: "text-slate-700",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => {
        const isActive = filter === tile.verdict;
        return (
          <button
            key={tile.verdict}
            type="button"
            onClick={() =>
              onFilterChange(isActive ? null : tile.verdict)
            }
            aria-pressed={isActive}
            className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left shadow-sm transition-colors ${
              isActive ? tile.active : tile.base
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              {tile.label}
            </span>
            <span className={`text-3xl font-semibold tabular-nums ${tile.number}`}>
              {tile.count}
            </span>
            <span className="text-xs text-slate-500">
              of {summary.total} total
            </span>
          </button>
        );
      })}
    </div>
  );
}
