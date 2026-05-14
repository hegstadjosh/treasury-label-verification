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
import type {
  BatchAnalyzeResponse,
  BatchLabelEntry,
  ExpectedLabel,
} from "@/lib/types";

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
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; response: BatchAnalyzeResponse };

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [expected, setExpected] = useState<ExpectedLabel>(EMPTY_EXPECTED);
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
  const canAnalyze = files.length > 0 && hasAnyExpected && !busy;

  const response: BatchAnalyzeResponse =
    status.kind === "done" ? status.response : EMPTY_RESPONSE;

  // Keep the selected entry's reference fresh when results change.
  const selectedFromResponse = useMemo(() => {
    if (!selected) return null;
    return response.labels.find((l) => l.id === selected.id) ?? null;
  }, [response.labels, selected]);

  async function analyze() {
    if (files.length === 0 || !hasAnyExpected) return;
    setStatus({ kind: "loading" });
    setSelected(null);

    try {
      const form = new FormData();
      for (const { file } of files) {
        form.append("image", file);
      }
      form.append("expected", JSON.stringify(expected));

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
        setStatus({ kind: "error", message });
        return;
      }

      const body = (await res.json()) as BatchAnalyzeResponse;
      startTransition(() => {
        setStatus({ kind: "done", response: body });
        setFilter(null);
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Network error while contacting /api/analyze-batch.",
      });
    }
  }

  function reset() {
    setFiles([]);
    setExpected(EMPTY_EXPECTED);
    setStatus({ kind: "idle" });
    setFilter(null);
    setSelected(null);
  }

  const hasResults = status.kind === "done" && response.labels.length > 0;

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
              Drag and drop, or choose files. PNG or JPG. The same declared
              fields will be checked against every label in the batch.
            </p>
            <div className="mt-4">
              <MultiUploadZone
                files={files}
                onFilesChange={setFiles}
                disabled={busy}
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              2. Declared fields
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              What the applicant said the label says. Leave a field blank to
              skip it.
            </p>
            <div className="mt-4">
              <ExpectedFieldsForm
                value={expected}
                onChange={setExpected}
                disabled={busy}
              />
            </div>
          </section>
        </div>

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {files.length === 0
              ? "Add at least one image to begin."
              : !hasAnyExpected
                ? "Enter at least one declared field to enable analysis."
                : busy
                  ? `Analyzing ${files.length} label${files.length === 1 ? "" : "s"}…`
                  : `Ready to analyze ${files.length} label${files.length === 1 ? "" : "s"}.`}
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
