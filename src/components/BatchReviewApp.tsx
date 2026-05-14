"use client";

import { AppHeader } from "./AppHeader";
import { BatchActionBar, ErrorBanner } from "./BatchActionBar";
import { DeclaredFieldsPanel } from "./DeclaredFieldsPanel";
import { LabelDrillDown } from "./LabelDrillDown";
import { OverviewTiles } from "./OverviewTiles";
import { QueueTable } from "./QueueTable";
import { UploadPanel } from "./UploadPanel";
import { useBatchAnalysis } from "@/hooks/useBatchAnalysis";

export function BatchReviewApp() {
  const batch = useBatchAnalysis();

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <UploadPanel
            files={batch.files}
            matchMode={batch.matchMode}
            matchStatus={batch.matchStatus}
            busy={batch.busy}
            onFilesChange={batch.setFiles}
          />
          <DeclaredFieldsPanel
            matchMode={batch.matchMode}
            setMatchMode={batch.setMatchMode}
            expected={batch.expected}
            setExpected={batch.setExpected}
            csvFilename={batch.csvFilename}
            csvParsed={batch.csvParsed}
            onCsvFile={batch.handleCsvFile}
            onClearCsv={batch.clearCsv}
            busy={batch.busy}
          />
        </div>

        <BatchActionBar
          message={batch.statusMessage}
          busy={batch.busy}
          canAnalyze={batch.canAnalyze}
          onReset={batch.reset}
          onAnalyze={batch.analyze}
        />

        {batch.status.kind === "error" ? (
          <div className="mt-6">
            <ErrorBanner message={batch.status.message} onRetry={batch.analyze} />
          </div>
        ) : null}

        <ResultsArea batch={batch} />

        <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">
          Prototype build. The government warning is matched verbatim against
          the 27 CFR §16.21 wording. Other fields are forgiving of casing and
          punctuation.
        </footer>
      </main>

      <LabelDrillDown
        entry={batch.selectedFromResponse}
        onClose={() => batch.setSelected(null)}
      />
    </div>
  );
}

function ResultsArea({ batch }: { batch: ReturnType<typeof useBatchAnalysis> }) {
  if (batch.hasResults) {
    return (
      <div className="mt-8 space-y-4">
        <OverviewTiles
          summary={batch.response.summary}
          filter={batch.filter}
          onFilterChange={batch.setFilter}
        />
        <QueueTable
          labels={batch.response.labels}
          filter={batch.filter}
          onSelect={batch.setSelected}
          selectedId={batch.selected?.id ?? null}
        />
      </div>
    );
  }

  if (batch.status.kind === "error") return null;

  return (
    <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
      Upload labels and analyze the batch to populate the review queue.
    </div>
  );
}
