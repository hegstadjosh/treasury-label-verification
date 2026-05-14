"use client";

import { useMemo, useState } from "react";
import type {
  BatchLabelEntry,
  LabelVerdict,
} from "@/lib/types";
import { QueueTableRow } from "./QueueTableRow";
import type { VerdictFilter } from "./OverviewTiles";

/** Exception-queue order: Fail first, then Needs Review, Unreadable, Pass last. */
const VERDICT_RANK: Record<LabelVerdict, number> = {
  Fail: 0,
  "Needs Review": 1,
  Unreadable: 2,
  Pass: 3,
};

type SortKey = "verdict" | "filename";
type SortDir = "asc" | "desc";

export function QueueTable({
  labels,
  filter,
  onSelect,
  selectedId,
}: {
  labels: BatchLabelEntry[];
  filter: VerdictFilter;
  onSelect: (entry: BatchLabelEntry) => void;
  selectedId?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("verdict");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = labels.filter((entry) => {
      if (filter && entry.result.verdict !== filter) return false;
      if (q === "") return true;
      const hay =
        `${entry.filename} ${entry.result.top_reason}`.toLowerCase();
      return hay.includes(q);
    });
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "verdict") {
        cmp =
          VERDICT_RANK[a.result.verdict] -
          VERDICT_RANK[b.result.verdict];
        if (cmp === 0) cmp = a.filename.localeCompare(b.filename);
      } else {
        cmp = a.filename.localeCompare(b.filename);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [labels, filter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Review queue
          </h2>
          <p className="text-xs text-slate-600">
            {labels.length === 0
              ? "No results yet."
              : filter
                ? `${visible.length} of ${labels.length} labels — filtered to ${filter}`
                : `${visible.length} of ${labels.length} labels`}
          </p>
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search filename or reason…"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 sm:w-64"
        />
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-2">
                <SortHeader
                  label="Filename"
                  active={sortKey === "filename"}
                  dir={sortDir}
                  onClick={() => toggleSort("filename")}
                />
              </th>
              <th className="px-3 py-2">
                <SortHeader
                  label="Verdict"
                  active={sortKey === "verdict"}
                  dir={sortDir}
                  onClick={() => toggleSort("verdict")}
                />
              </th>
              <th className="px-3 py-2">Top reason</th>
              <th className="w-px px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-sm text-slate-500"
                >
                  {labels.length === 0
                    ? "Upload labels and click Analyze to populate the queue."
                    : "No labels match this filter."}
                </td>
              </tr>
            ) : (
              visible.map((entry) => {
                const isSelected = entry.id === selectedId;
                return (
                  <QueueTableRow
                    key={entry.id}
                    entry={entry}
                    isSelected={isSelected}
                    onSelect={onSelect}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-900"
    >
      <span>{label}</span>
      <span
        aria-hidden
        className={`text-[10px] ${active ? "text-slate-700" : "text-slate-300"}`}
      >
        {active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}
      </span>
    </button>
  );
}
