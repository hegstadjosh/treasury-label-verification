"use client";

import { useState } from "react";
import { UploadZone } from "@/components/UploadZone";
import { ExpectedFieldsForm } from "@/components/ExpectedFieldsForm";
import { ResultPanel } from "@/components/ResultPanel";
import type { ExpectedLabel, LabelResult } from "@/lib/types";

const EMPTY_EXPECTED: ExpectedLabel = {
  brand_name: "",
  class_type: "",
  alcohol_content: "",
  net_contents: "",
  government_warning_required: true,
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; result: LabelResult };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [expected, setExpected] = useState<ExpectedLabel>(EMPTY_EXPECTED);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const hasAnyExpected =
    expected.brand_name.trim() !== "" ||
    expected.class_type.trim() !== "" ||
    expected.alcohol_content.trim() !== "" ||
    expected.net_contents.trim() !== "";
  const canAnalyze =
    !!file && hasAnyExpected && status.kind !== "loading";

  async function analyze() {
    if (!file) return;
    setStatus({ kind: "loading" });
    try {
      const form = new FormData();
      form.append("image", file);
      form.append("expected", JSON.stringify(expected));

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        let message = `Analyze failed (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          // ignore JSON parse errors and use the default message
        }
        setStatus({ kind: "error", message });
        return;
      }

      const result = (await res.json()) as LabelResult;
      setStatus({ kind: "done", result });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Network error while contacting /api/analyze.",
      });
    }
  }

  function reset() {
    setFile(null);
    setExpected(EMPTY_EXPECTED);
    setStatus({ kind: "idle" });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            TTB Prototype
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            Alcohol Label Verification
          </h1>
          <p className="text-sm text-slate-600">
            Upload a label image and the applicant&rsquo;s declared fields.
            The system extracts what is visible, compares it to what was
            declared, and returns a pass / needs-review / fail verdict with a
            full audit trail.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              1. Upload the label
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Drag and drop, or choose a file. PNG or JPG.
            </p>
            <div className="mt-4">
              <UploadZone
                file={file}
                onFileChange={setFile}
                disabled={status.kind === "loading"}
              />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              2. Enter the declared fields
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Fill in what the applicant told us the label says. Leave fields
              blank if the applicant did not declare them.
            </p>
            <div className="mt-4">
              <ExpectedFieldsForm
                value={expected}
                onChange={setExpected}
                disabled={status.kind === "loading"}
              />
            </div>
          </section>
        </div>

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            {!file
              ? "Add an image to begin."
              : !hasAnyExpected
                ? "Enter at least one declared field to enable analysis."
                : status.kind === "loading"
                  ? "Analyzing label…"
                  : "Ready to analyze."}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={reset}
              disabled={status.kind === "loading"}
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
              {status.kind === "loading" ? (
                <>
                  <Spinner />
                  <span className="ml-2">Analyzing…</span>
                </>
              ) : (
                "Analyze label"
              )}
            </button>
          </div>
        </div>

        <div className="mt-6">
          {status.kind === "error" ? (
            <ErrorBanner message={status.message} onRetry={analyze} />
          ) : null}
          {status.kind === "done" ? (
            <ResultPanel result={status.result} />
          ) : null}
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Prototype build. Government warning is matched verbatim against the
          27 CFR §16.21 wording. Other fields are forgiving of casing and
          punctuation.
        </footer>
      </main>
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
