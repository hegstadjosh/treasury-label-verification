"use client";

import { useState } from "react";
import type {
  Field,
  FieldResult,
  LabelResult,
} from "@/lib/types";
import { VerdictBadge } from "./VerdictBadge";

const FIELD_LABELS: Record<Field, string> = {
  brand_name: "Brand name",
  class_type: "Class / type",
  alcohol_content: "Alcohol content",
  net_contents: "Net contents",
  government_warning: "Government warning",
  image_quality: "Image quality",
};

export function ResultPanel({ result }: { result: LabelResult }) {
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const fields = result.fields ?? [];
  const extracted = result.extracted ?? {};

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <VerdictBadge verdict={result.verdict} size="lg" />
          <h2 className="text-lg font-semibold text-slate-900">
            Label result
          </h2>
        </div>
      </header>

      {result.top_reason ? (
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-800">
          <span className="font-medium text-slate-900">Main issue: </span>
          {result.top_reason}
        </div>
      ) : null}

      <div className="px-5 py-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          What the system checked
        </h3>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2">Field</th>
                <th className="px-3 py-2">Expected</th>
                <th className="px-3 py-2">Extracted</th>
                <th className="px-3 py-2">Verdict</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {fields.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-slate-500"
                  >
                    No field results returned.
                  </td>
                </tr>
              ) : (
                fields.map((row) => <FieldRow key={row.field} row={row} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <button
          type="button"
          onClick={() => setEvidenceOpen((v) => !v)}
          aria-expanded={evidenceOpen}
          className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
        >
          <span>AI evidence</span>
          <span aria-hidden className="text-slate-500">
            {evidenceOpen ? "−" : "+"}
          </span>
        </button>
        {evidenceOpen ? (
          <div className="space-y-4 border-t border-slate-200 px-5 py-4 text-sm">
            <EvidenceBlock
              label="Text found on label"
              body={extracted.raw_text}
              mono
            />
            <EvidenceBlock label="AI notes" body={extracted.notes} />
            {extracted.confidence &&
            Object.keys(extracted.confidence).length > 0 ? (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  AI confidence by field
                </div>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {(Object.entries(extracted.confidence) as [
                    Field,
                    number | undefined,
                  ][])
                    .filter(([, v]) => typeof v === "number")
                    .map(([field, conf]) => (
                      <li
                        key={field}
                        className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1"
                      >
                        <span className="text-slate-700">
                          {FIELD_LABELS[field]}
                        </span>
                        <span className="font-mono text-slate-900">
                          {(conf as number).toFixed(2)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FieldRow({ row }: { row: FieldResult }) {
  return (
    <tr className="align-top">
      <td className="px-3 py-2 font-medium text-slate-900">
        {FIELD_LABELS[row.field]}
      </td>
      <td className="px-3 py-2 text-slate-700">
        <CellText value={row.expected} />
      </td>
      <td className="px-3 py-2 text-slate-700">
        <CellText value={row.extracted} />
      </td>
      <td className="px-3 py-2">
        <VerdictBadge verdict={row.verdict} size="sm" />
      </td>
      <td className="px-3 py-2 text-slate-700">
        <CellText value={row.reason} />
      </td>
    </tr>
  );
}

function CellText({ value }: { value: string | undefined }) {
  if (!value || value.trim() === "") {
    return <span className="text-slate-400">—</span>;
  }
  return <span className="whitespace-pre-wrap">{value}</span>;
}

function EvidenceBlock({
  label,
  body,
  mono = false,
}: {
  label: string;
  body: string | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </div>
      {body && body.trim() !== "" ? (
        <pre
          className={`max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-3 text-slate-800 ${
            mono ? "font-mono text-xs" : "text-sm"
          }`}
        >
          {body}
        </pre>
      ) : (
        <p className="text-sm text-slate-500">Not provided.</p>
      )}
    </div>
  );
}
