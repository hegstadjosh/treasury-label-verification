"use client";

import { MultiUploadZone } from "./MultiUploadZone";
import type { UploadedFile } from "./uploadTypes";
import type { MatchMode } from "@/hooks/useBatchAnalysis";

type MatchStatus = { matched: string[]; unmatched: string[] } | null;

export function UploadPanel({
  files,
  matchMode,
  matchStatus,
  busy,
  onFilesChange,
}: {
  files: UploadedFile[];
  matchMode: MatchMode;
  matchStatus: MatchStatus;
  busy: boolean;
  onFilesChange: (next: UploadedFile[]) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">1. Upload labels</h2>
      <p className="mt-1 text-sm text-slate-600">
        {matchMode === "shared"
          ? "Drag and drop, or choose files. The same declared fields will be checked against every label."
          : "Drag and drop, or choose files. Each label is matched to its own CSV row by filename."}
      </p>
      <div className="mt-4">
        <MultiUploadZone files={files} onFilesChange={onFilesChange} disabled={busy} />
      </div>
      <MatchSummary files={files} matchStatus={matchStatus} />
    </section>
  );
}

function MatchSummary({
  files,
  matchStatus,
}: {
  files: UploadedFile[];
  matchStatus: MatchStatus;
}) {
  if (!matchStatus || (matchStatus.matched.length === 0 && matchStatus.unmatched.length === 0)) {
    return null;
  }
  return (
    <div className="mt-3 text-xs">
      {matchStatus.matched.length > 0 ? (
        <p className="text-emerald-700">
          Matched {matchStatus.matched.length} of {files.length} to CSV rows.
        </p>
      ) : null}
      {matchStatus.unmatched.length > 0 ? <UnmatchedWarning unmatched={matchStatus.unmatched} /> : null}
    </div>
  );
}

function UnmatchedWarning({ unmatched }: { unmatched: string[] }) {
  return (
    <div className="mt-1 text-rose-700">
      <p className="font-medium">
        No CSV row for: {unmatched.slice(0, 3).join(", ")}
        {unmatched.length > 3 ? `, +${unmatched.length - 3} more` : ""}.
      </p>
      <p className="mt-0.5 text-rose-600/80">
        Add rows to the CSV with these filenames, or remove the images.
      </p>
    </div>
  );
}
