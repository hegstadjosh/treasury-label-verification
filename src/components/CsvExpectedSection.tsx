"use client";

import { useState, type DragEvent } from "react";
import type { CsvParseResult } from "@/lib/csv";

export function CsvExpectedSection({
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
        Upload a spreadsheet saved as CSV. Each row must use the same filename
        as its label image (case-insensitive). Required columns:{" "}
        <CsvCode>filename</CsvCode>, <CsvCode>brand_name</CsvCode>,{" "}
        <CsvCode>class_type</CsvCode>, <CsvCode>alcohol_content</CsvCode>,{" "}
        <CsvCode>net_contents</CsvCode>. Optional:{" "}
        <CsvCode>government_warning_required</CsvCode>.
      </p>
      <a
        href="/demo-batch.csv"
        download
        className="mt-3 inline-flex rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
      >
        Download sample spreadsheet
      </a>
      <CsvDropzone
        csvFilename={csvFilename}
        disabled={disabled}
        onFile={onFile}
        onClear={onClear}
      />
      <CsvPreview csvParsed={csvParsed} />
    </>
  );
}

function CsvCode({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{children}</code>;
}

/**
 * Drag-and-drop + click-to-pick spreadsheet input. Mirrors the multi-image
 * dropzone so the two upload surfaces feel consistent.
 */
function CsvDropzone({
  csvFilename,
  disabled,
  onFile,
  onClear,
}: {
  csvFilename: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const [isOver, setIsOver] = useState(false);

  function acceptable(file: File): boolean {
    if (file.name.toLowerCase().endsWith(".csv")) return true;
    return file.type === "text/csv" || file.type === "application/vnd.ms-excel";
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    if (disabled) return;
    const file = Array.from(e.dataTransfer.files).find(acceptable);
    if (file) onFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  }

  return (
    <div className="mt-3 flex flex-col items-stretch gap-3">
      <label
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition-colors " +
          (disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
            : isOver
              ? "border-blue-500 bg-blue-50 text-blue-900"
              : csvFilename
                ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-400"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50")
        }
      >
        {csvFilename ? (
          <>
            <span className="font-medium">Loaded: {csvFilename}</span>
            <span className="text-xs text-emerald-700/80">
              Drop another spreadsheet or click to replace.
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">
              Drop a spreadsheet here, or click to choose
            </span>
            <span className="text-xs text-slate-500">
              .csv from Excel, Google Sheets, or anywhere else.
            </span>
          </>
        )}
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </label>
      {csvFilename ? (
        <div className="flex items-center justify-end text-sm text-slate-700">
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-50"
          >
            clear spreadsheet
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CsvPreview({ csvParsed }: { csvParsed: CsvParseResult | null }) {
  if (!csvParsed) {
    return null;
  }
  if (!csvParsed.ok) {
    return (
      <div role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
        <span className="font-medium">Spreadsheet error. </span>
        {csvParsed.error}
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
      Parsed {csvParsed.rows.length} row{csvParsed.rows.length === 1 ? "" : "s"}. Filenames:
      <div className="mt-1 font-mono text-slate-600">
        {csvParsed.rows.slice(0, 6).map((r) => r.filename).join(", ")}
        {csvParsed.rows.length > 6 ? `, +${csvParsed.rows.length - 6} more` : ""}
      </div>
    </div>
  );
}
