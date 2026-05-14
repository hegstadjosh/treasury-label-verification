"use client";

import { ExpectedFieldsForm } from "./ExpectedFieldsForm";
import { CsvExpectedSection } from "./CsvExpectedSection";
import { ModeToggle } from "./ModeToggle";
import type { CsvParseResult } from "@/lib/csv";
import type { ExpectedLabel } from "@/lib/types";
import type { MatchMode } from "@/hooks/useBatchAnalysis";

export function DeclaredFieldsPanel({
  matchMode,
  setMatchMode,
  expected,
  setExpected,
  csvFilename,
  csvParsed,
  onCsvFile,
  onClearCsv,
  busy,
}: {
  matchMode: MatchMode;
  setMatchMode: (mode: MatchMode) => void;
  expected: ExpectedLabel;
  setExpected: (expected: ExpectedLabel) => void;
  csvFilename: string;
  csvParsed: CsvParseResult | null;
  onCsvFile: (file: File) => void;
  onClearCsv: () => void;
  busy: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">2. Declared fields</h2>
      <div className="mt-3" role="radiogroup" aria-label="Expected-fields source">
        <ModeToggle value={matchMode} onChange={setMatchMode} disabled={busy} />
      </div>
      {matchMode === "shared" ? (
        <SharedFields expected={expected} setExpected={setExpected} busy={busy} />
      ) : (
        <CsvExpectedSection
          csvFilename={csvFilename}
          csvParsed={csvParsed}
          onFile={onCsvFile}
          onClear={onClearCsv}
          disabled={busy}
        />
      )}
    </section>
  );
}

function SharedFields({
  expected,
  setExpected,
  busy,
}: {
  expected: ExpectedLabel;
  setExpected: (expected: ExpectedLabel) => void;
  busy: boolean;
}) {
  return (
    <>
      <p className="mt-3 text-sm text-slate-600">
        What the applicant said the label says. Same values apply to every label.
      </p>
      <div className="mt-3">
        <ExpectedFieldsForm value={expected} onChange={setExpected} disabled={busy} />
      </div>
    </>
  );
}
