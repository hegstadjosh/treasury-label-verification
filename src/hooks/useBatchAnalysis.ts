"use client";

import { useMemo, useState, useTransition } from "react";
import type { BatchLabelEntry, ExpectedLabel } from "@/lib/types";
import type { UploadedFile } from "@/components/uploadTypes";
import type { VerdictFilter } from "@/components/OverviewTiles";
import { analyzeChunks } from "./batchAnalysisRequest";
import {
  canAnalyzeNow,
  getMatchStatus,
  getStatusMessage,
  hasResults,
  parseCsvText,
  responseFromStatus,
} from "./batchAnalysisSelectors";
import {
  EMPTY_EXPECTED,
  type BatchStatus,
  type MatchMode,
} from "./batchAnalysisTypes";

export type { MatchMode } from "./batchAnalysisTypes";

export function useBatchAnalysis() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [matchMode, setMatchMode] = useState<MatchMode>("shared");
  const [expected, setExpected] = useState<ExpectedLabel>(EMPTY_EXPECTED);
  const [csvText, setCsvText] = useState("");
  const [csvFilename, setCsvFilename] = useState("");
  const [status, setStatus] = useState<BatchStatus>({ kind: "idle" });
  const [filter, setFilter] = useState<VerdictFilter>(null);
  const [selected, setSelected] = useState<BatchLabelEntry | null>(null);
  const [isPending, startTransition] = useTransition();

  const busy = status.kind === "loading" || isPending;
  const csvParsed = useMemo(() => parseCsvText(csvText), [csvText]);
  const matchStatus = useMemo(
    () => getMatchStatus(matchMode, csvParsed, files),
    [matchMode, csvParsed, files],
  );
  const canAnalyze = canAnalyzeNow({
    busy,
    files,
    matchMode,
    expected,
    csvParsed,
    matchStatus,
  });
  const response = responseFromStatus(status);
  const selectedFromResponse = useMemo(
    () => selected ? response.labels.find((l) => l.id === selected.id) ?? null : null,
    [response.labels, selected],
  );
  const selectedImageFile = useMemo(() => {
    if (!selectedFromResponse) return null;
    const index = response.labels.findIndex((l) => l.id === selectedFromResponse.id);
    return index >= 0 ? files[index]?.file ?? null : null;
  }, [files, response.labels, selectedFromResponse]);

  async function handleCsvFile(file: File) {
    setCsvText(await file.text());
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
    await analyzeChunks({ files, expected, matchMode, csvParsed, setStatus, startTransition });
  }

  function reset() {
    setFiles([]);
    setExpected(EMPTY_EXPECTED);
    clearCsv();
    setStatus({ kind: "idle" });
    setFilter(null);
    setSelected(null);
  }

  return {
    files,
    setFiles,
    matchMode,
    setMatchMode,
    expected,
    setExpected,
    csvFilename,
    csvParsed,
    matchStatus,
    handleCsvFile,
    clearCsv,
    status,
    statusMessage: getStatusMessage({
      status,
      files,
      matchMode,
      expected,
      csvParsed,
      matchStatus,
      busy,
    }),
    response,
    hasResults: hasResults(status, response),
    filter,
    setFilter,
    selected,
    setSelected,
    selectedFromResponse,
    selectedImageFile,
    busy,
    canAnalyze,
    analyze,
    reset,
  };
}
