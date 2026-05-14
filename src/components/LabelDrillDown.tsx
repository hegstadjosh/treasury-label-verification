"use client";

import { useEffect } from "react";
import type { BatchLabelEntry } from "@/lib/types";
import { ResultPanel } from "./ResultPanel";

export function LabelDrillDown({
  entry,
  onClose,
}: {
  entry: BatchLabelEntry | null;
  onClose: () => void;
}) {
  const open = entry !== null;

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !entry) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${entry.filename}`}
      className="fixed inset-0 z-50 flex"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />

      {/* Panel — full-screen on mobile, right-side sheet on desktop. */}
      <aside className="relative ml-auto flex h-full w-full flex-col bg-slate-50 shadow-xl sm:max-w-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Review label
            </p>
            <h2
              className="truncate text-base font-semibold text-slate-900"
              title={entry.filename}
            >
              {entry.filename}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to queue
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <ResultPanel result={entry.result} />
        </div>
      </aside>
    </div>
  );
}
