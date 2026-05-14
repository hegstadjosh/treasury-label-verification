"use client";

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
        Upload a CSV with one row per label. Required columns:{" "}
        <CsvCode>filename</CsvCode>, <CsvCode>brand_name</CsvCode>,{" "}
        <CsvCode>class_type</CsvCode>, <CsvCode>alcohol_content</CsvCode>,{" "}
        <CsvCode>net_contents</CsvCode>. Optional:{" "}
        <CsvCode>government_warning_required</CsvCode>.
      </p>
      <CsvFileInput
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

function CsvFileInput({
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
  return (
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
            const file = e.target.files?.[0];
            if (file) onFile(file);
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
  );
}

function CsvPreview({ csvParsed }: { csvParsed: CsvParseResult | null }) {
  if (!csvParsed) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-center text-xs text-slate-500">
        No CSV loaded yet.
      </div>
    );
  }
  if (!csvParsed.ok) {
    return (
      <div role="alert" className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
        <span className="font-medium">CSV error. </span>
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
