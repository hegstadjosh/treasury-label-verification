"use client";

import { useMemo, useState, useTransition } from "react";
import { ExpectedFieldsForm } from "@/components/ExpectedFieldsForm";
import {
  MultiUploadZone,
  type UploadedFile,
} from "@/components/MultiUploadZone";
import {
  OverviewTiles,
  type VerdictFilter,
} from "@/components/OverviewTiles";
import { QueueTable } from "@/components/QueueTable";
import { LabelDrillDown } from "@/components/LabelDrillDown";
import { parseExpectedByFilenameCsv, type CsvParseResult } from "@/lib/csv";
import type {
  BatchAnalyzeResponse,
  BatchLabelEntry,
  ExpectedLabel,
} from "@/lib/types";

/**
 * Match modes determine how each label is paired with expected fields.
 *
 * `shared` — one expected set applies to every label in the batch. Useful
 *   for same-product runs (label-design iteration, QC). This was the
 *   original iter-4 model.
 *
 * `per-file` — reviewer uploads a CSV (or pasted CSV text) mapping each
 *   filename to its OWN expected fields. This is the realistic flow for
 *   Sarah Chen's "200 importer applications dumped at once" scenario,
 *   where every label is a different product. In a production COLA
 *   integration the same `expectedByFilename` map would be auto-populated
 *   from the application record; the CSV is a believable stand-in.
 */
type MatchMode = "shared" | "per-file";

const EMPTY_EXPECTED: ExpectedLabel = {
  brand_name: "",
  class_type: "",
  alcohol_content: "",
  net_contents: "",
  government_warning_required: true,
};

const EMPTY_RESPONSE: BatchAnalyzeResponse = {
  labels: [],
  summary: { total: 0, pass: 0, needs_review: 0, fail: 0, unreadable: 0 },
};

type Status =
  | { kind: "idle" }
  | { kind: "loading"; processed: number; total: number; partial: BatchAnalyzeResponse }
  | { kind: "error"; message: string; partial: BatchAnalyzeResponse }
  | { kind: "done"; response: BatchAnalyzeResponse };

/**
 * Batch chunking constants.
 *
 * Vercel serverless functions cap the request body at ~4.5 MB by default; the
 * stakeholder use case (200-300 labels per dump, ~1-4 MB per photo) is well
 * over that. Splitting the upload into chunks both side-steps the platform
 * limit and gives the reviewer per-chunk progress feedback — at 8 labels per
 * chunk, the queue populates roughly every Gemini round-trip (~8 s) instead
 * of staring at a static spinner for minutes.
 *
 * Chunk size deliberately matches the server's `BATCH_CONCURRENCY` so each
 * chunk fits inside a single server-side fan-out pass.
 */
const CLIENT_CHUNK_SIZE = 8;

const EMPTY_SUMMARY = {
  total: 0,
  pass: 0,
  needs_review: 0,
  fail: 0,
  unreadable: 0,
};

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>("shared");
  const [expected, setExpected] = useState<ExpectedLabel>(EMPTY_EXPECTED);
  const [csvText, setCsvText] = useState<string>("");
  const [csvFilename, setCsvFilename] = useState<string>("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [filter, setFilter] = useState<VerdictFilter>(null);
  const [selected, setSelected] = useState<BatchLabelEntry | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasAnyExpected =
    expected.brand_name.trim() !== "" ||
    expected.class_type.trim() !== "" ||
    expected.alcohol_content.trim() !== "" ||
    expected.net_contents.trim() !== "";
  const busy = status.kind === "loading" || isPending;

  // Parse the CSV text once per change. Pure function, cheap.
  const csvParsed: CsvParseResult | null = useMemo(
    () => (csvText.trim() === "" ? null : parseExpectedByFilenameCsv(csvText)),
    [csvText],
  );

  // In per-file mode, every uploaded image must have a matching CSV row.
  // We surface matched/unmatched lists in the UI and use them to gate the
  // Analyze button so the reviewer can fix mismatches before sending.
  const matchStatus = useMemo(() => {
    if (matchMode !== "per-file" || !csvParsed || !csvParsed.ok) return null;
    const matched: string[] = [];
    const unmatched: string[] = [];
    for (const { file } of files) {
      if (csvParsed.byFilename[file.name.toLowerCase()]) {
        matched.push(file.name);
      } else {
        unmatched.push(file.name);
      }
    }
    return { matched, unmatched };
  }, [matchMode, csvParsed, files]);

  const canAnalyze =
    !busy &&
    files.length > 0 &&
    (matchMode === "shared"
      ? hasAnyExpected
      : csvParsed?.ok === true && (matchStatus?.unmatched.length ?? 0) === 0);

  const response: BatchAnalyzeResponse =
    status.kind === "done"
      ? status.response
      : status.kind === "loading" || status.kind === "error"
        ? status.partial
        : EMPTY_RESPONSE;

  // Keep the selected entry's reference fresh when results change.
  const selectedFromResponse = useMemo(() => {
    if (!selected) return null;
    return response.labels.find((l) => l.id === selected.id) ?? null;
  }, [response.labels, selected]);

  async function handleCsvFile(file: File) {
    const text = await file.text();
    setCsvText(text);
    setCsvFilename(file.name);
  }

  function clearCsv() {
    setCsvText("");
    setCsvFilename("");
  }

  async function analyze() {
    if (!canAnalyze) return;
    setSelected(null);
    setFilter(null);

    const total = files.length;
    let merged: BatchLabelEntry[] = [];
    let summary = { ...EMPTY_SUMMARY };

    startTransition(() => {
      setStatus({
        kind: "loading",
        processed: 0,
        total,
        partial: { labels: [], summary: { ...summary, total: 0 } },
      });
    });

    // In per-file mode, narrow the byFilename map to just this chunk's
    // filenames before sending — keeps each request's body small and the
    // server contract simple (every uploaded image has a matching row).
    const byFilenameAll =
      matchMode === "per-file" && csvParsed?.ok ? csvParsed.byFilename : null;

    for (let offset = 0; offset < total; offset += CLIENT_CHUNK_SIZE) {
      const chunk = files.slice(offset, offset + CLIENT_CHUNK_SIZE);
      const form = new FormData();
      for (const { file } of chunk) form.append("image", file);
      if (matchMode === "shared") {
        form.append("expected", JSON.stringify(expected));
      } else if (byFilenameAll) {
        const subset: Record<string, ExpectedLabel> = {};
        for (const { file } of chunk) {
          const key = file.name.toLowerCase();
          const row = byFilenameAll[key];
          if (row) subset[key] = row;
        }
        form.append("expectedByFilename", JSON.stringify(subset));
      }

      let body: BatchAnalyzeResponse;
      try {
        const res = await fetch("/api/analyze-batch", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          let message = `Analyze failed (${res.status})`;
          try {
            const data = (await res.json()) as { error?: string };
            if (data?.error) message = data.error;
          } catch {
            // ignore JSON parse errors
          }
          setStatus({
            kind: "error",
            message,
            partial: { labels: merged, summary: { ...summary, total: merged.length } },
          });
          return;
        }
        body = (await res.json()) as BatchAnalyzeResponse;
      } catch (err) {
        setStatus({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Network error while contacting /api/analyze-batch.",
          partial: { labels: merged, summary: { ...summary, total: merged.length } },
        });
        return;
      }

      // Re-id chunk results to use the upload-order global index so React keys
      // stay stable across chunks and the queue renders in upload order.
      const reindexed = body.labels.map((entry, idx) => ({
        ...entry,
        id: `${offset + idx}-${entry.filename}`,
      }));
      merged = [...merged, ...reindexed];
      summary = {
        total: merged.length,
        pass: summary.pass + body.summary.pass,
        needs_review: summary.needs_review + body.summary.needs_review,
        fail: summary.fail + body.summary.fail,
        unreadable: summary.unreadable + body.summary.unreadable,
      };

      const processed = Math.min(offset + chunk.length, total);
      const partial: BatchAnalyzeResponse = { labels: merged, summary };
      const isFinal = processed >= total;

      startTransition(() => {
        if (isFinal) {
          setStatus({ kind: "done", response: partial });
        } else {
          setStatus({ kind: "loading", processed, total, partial });
        }
      });
    }
  }

  function reset() {
    setFiles([]);
    setExpected(EMPTY_EXPECTED);
    setCsvText("");
    setCsvFilename("");
    setStatus({ kind: "idle" });
    setFilter(null);
    setSelected(null);
  }

  const hasResults =
    (status.kind === "done" || status.kind === "loading" || status.kind === "error") &&
    response.labels.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            TTB Prototype
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Alcohol Label Verification — Batch Review
          </h1>
          <p className="text-sm text-slate-600">
            Upload one or more labels, declare what the applicant said they
            contain, and the system returns an automatic verdict per label.
            Clear cases are handled automatically; only exceptions need a
            human look.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              1. Upload labels
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {matchMode === "shared"
                ? "Drag and drop, or choose files. PNG or JPG. The same declared fields will be checked against every label in the batch."
                : "Drag and drop, or choose files. PNG or JPG. Each label is matched to its own CSV row by filename (case-insensitive)."}
            </p>
            <div className="mt-4">
              <MultiUploadZone
                files={files}
                onFilesChange={setFiles}
                disabled={busy}
              />
            </div>
            {matchStatus && (matchStatus.matched.length > 0 || matchStatus.unmatched.length > 0) ? (
              <div className="mt-3 text-xs">
                {matchStatus.matched.length > 0 ? (
                  <p className="text-emerald-700">
                    Matched {matchStatus.matched.length} of {files.length} to CSV rows.
                  </p>
                ) : null}
                {matchStatus.unmatched.length > 0 ? (
                  <div className="mt-1 text-rose-700">
                    <p className="font-medium">
                      No CSV row for: {matchStatus.unmatched.slice(0, 3).join(", ")}
                      {matchStatus.unmatched.length > 3 ? `, +${matchStatus.unmatched.length - 3} more` : ""}.
                    </p>
                    <p className="mt-0.5 text-rose-600/80">
                      Add rows to the CSV with these filenames, or remove the images.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              2. Declared fields
            </h2>
            <div className="mt-3" role="radiogroup" aria-label="Expected-fields source">
              <ModeToggle
                value={matchMode}
                onChange={setMatchMode}
                disabled={busy}
              />
            </div>
            {matchMode === "shared" ? (
              <>
                <p className="mt-3 text-sm text-slate-600">
                  What the applicant said the label says. Leave a field blank to skip it.
                  Same values apply to every label in the batch.
                </p>
                <div className="mt-3">
                  <ExpectedFieldsForm
                    value={expected}
                    onChange={setExpected}
                    disabled={busy}
                  />
                </div>
              </>
            ) : (
              <CsvExpectedSection
                csvFilename={csvFilename}
                csvParsed={csvParsed}
                onFile={handleCsvFile}
                onClear={clearCsv}
                disabled={busy}
              />
            )}
          </section>
        </div>

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {(() => {
              if (status.kind === "loading") {
                return `Analyzed ${status.processed} of ${status.total} label${status.total === 1 ? "" : "s"}…`;
              }
              if (busy) {
                return `Analyzing ${files.length} label${files.length === 1 ? "" : "s"}…`;
              }
              if (files.length === 0) {
                return "Add at least one image to begin.";
              }
              if (matchMode === "shared") {
                if (!hasAnyExpected) {
                  return "Enter at least one declared field to enable analysis.";
                }
              } else {
                if (!csvParsed) {
                  return "Upload a CSV with per-label expected fields.";
                }
                if (!csvParsed.ok) {
                  return "Fix the CSV errors before analyzing.";
                }
                const unmatched = matchStatus?.unmatched.length ?? 0;
                if (unmatched > 0) {
                  return `${unmatched} image${unmatched === 1 ? " has" : "s have"} no matching CSV row. Fix the mapping or remove them.`;
                }
              }
              return `Ready to analyze ${files.length} label${files.length === 1 ? "" : "s"}.`;
            })()}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={analyze}
              disabled={!canAnalyze}
              className="inline-flex items-center justify-center rounded-md bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? (
                <>
                  <Spinner />
                  <span className="ml-2">Analyzing…</span>
                </>
              ) : (
                "Analyze batch"
              )}
            </button>
          </div>
        </div>

        {status.kind === "error" ? (
          <div className="mt-6">
            <ErrorBanner message={status.message} onRetry={analyze} />
          </div>
        ) : null}

        {hasResults ? (
          <div className="mt-8 space-y-4">
            <OverviewTiles
              summary={response.summary}
              filter={filter}
              onFilterChange={setFilter}
            />
            <QueueTable
              labels={response.labels}
              filter={filter}
              onSelect={setSelected}
              selectedId={selected?.id ?? null}
            />
          </div>
        ) : status.kind !== "error" ? (
          <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
            Upload labels and analyze the batch to populate the review queue.
          </div>
        ) : null}

        <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Prototype build. The government warning is matched verbatim against
          the 27 CFR §16.21 wording. Other fields are forgiving of casing
          and punctuation.
        </footer>
      </main>

      <LabelDrillDown
        entry={selectedFromResponse}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: MatchMode;
  onChange: (mode: MatchMode) => void;
  disabled?: boolean;
}) {
  const options: Array<{ value: MatchMode; label: string; sub: string }> = [
    {
      value: "shared",
      label: "Same for all",
      sub: "One product, many photos",
    },
    {
      value: "per-file",
      label: "Per-label CSV",
      sub: "Multiple applications, each with its own fields",
    },
  ];
  return (
    <div className="inline-flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-1 sm:flex-row">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={
              "rounded px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 " +
              (selected
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            <div className="font-medium">{opt.label}</div>
            <div className="text-xs text-slate-500">{opt.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

function CsvExpectedSection({
  csvFilename,
  csvParsed,
  onFile,
  onClear,
  disabled,
}: {
  csvFilename: string;
  csvParsed: CsvParseResult | null;
  onFile: (file: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <>
      <p className="mt-3 text-sm text-slate-600">
        Upload a CSV with one row per label. Required columns:
        {" "}<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">filename</code>,
        {" "}<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">brand_name</code>,
        {" "}<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">class_type</code>,
        {" "}<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">alcohol_content</code>,
        {" "}<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">net_contents</code>.
        Optional: <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">government_warning_required</code> (true/false, default true).
      </p>

      <div className="mt-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <label
          className={
            "inline-flex cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 " +
            (disabled ? "cursor-not-allowed opacity-50" : "")
          }
        >
          {csvFilename ? "Replace CSV" : "Choose CSV file"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              // reset value so the same file can be re-uploaded after edit
              e.target.value = "";
            }}
          />
        </label>
        {csvFilename ? (
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <span className="truncate">{csvFilename}</span>
            <button
              type="button"
              onClick={onClear}
              disabled={disabled}
              className="text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              clear
            </button>
          </div>
        ) : null}
      </div>

      {csvParsed ? (
        csvParsed.ok ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Parsed {csvParsed.rows.length} row{csvParsed.rows.length === 1 ? "" : "s"}. Filenames:
            <div className="mt-1 font-mono text-slate-600">
              {csvParsed.rows.slice(0, 6).map((r) => r.filename).join(", ")}
              {csvParsed.rows.length > 6 ? `, +${csvParsed.rows.length - 6} more` : ""}
            </div>
          </div>
        ) : (
          <div
            role="alert"
            className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
          >
            <span className="font-medium">CSV error. </span>
            {csvParsed.error}
          </div>
        )
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-center text-xs text-slate-500">
          No CSV loaded yet.
        </div>
      )}
    </>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      className="h-4 w-4 animate-spin text-white"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <span className="font-semibold">Analysis failed. </span>
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="self-start rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm font-medium text-rose-800 shadow-sm hover:bg-rose-100 sm:self-auto"
      >
        Retry
      </button>
    </div>
  );
}
