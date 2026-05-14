import { parseExpectedByFilenameCsv, type CsvParseResult } from "@/lib/csv";
import type { BatchAnalyzeResponse, ExpectedLabel } from "@/lib/types";
import type { UploadedFile } from "@/components/uploadTypes";
import type { BatchStatus, MatchMode } from "./batchAnalysisTypes";
import { EMPTY_RESPONSE } from "./batchAnalysisTypes";

export type MatchStatus = { matched: string[]; unmatched: string[] } | null;

export function parseCsvText(csvText: string): CsvParseResult | null {
  return csvText.trim() === "" ? null : parseExpectedByFilenameCsv(csvText);
}

export function getMatchStatus(
  matchMode: MatchMode,
  csvParsed: CsvParseResult | null,
  files: UploadedFile[],
): MatchStatus {
  if (matchMode !== "per-file" || !csvParsed || !csvParsed.ok) return null;
  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const { file } of files) {
    if (csvParsed.byFilename[file.name.toLowerCase()]) matched.push(file.name);
    else unmatched.push(file.name);
  }
  return { matched, unmatched };
}

export function canAnalyzeNow(opts: {
  busy: boolean;
  files: UploadedFile[];
  matchMode: MatchMode;
  expected: ExpectedLabel;
  csvParsed: CsvParseResult | null;
  matchStatus: MatchStatus;
}): boolean {
  if (opts.busy || opts.files.length === 0) return false;
  if (opts.matchMode === "shared") return hasAnyExpected(opts.expected);
  return opts.csvParsed?.ok === true && (opts.matchStatus?.unmatched.length ?? 0) === 0;
}

export function responseFromStatus(status: BatchStatus): BatchAnalyzeResponse {
  if (status.kind === "done") return status.response;
  if (status.kind === "loading" || status.kind === "error") return status.partial;
  return EMPTY_RESPONSE;
}

export function hasResults(
  status: BatchStatus,
  response: BatchAnalyzeResponse,
): boolean {
  return status.kind !== "idle" && response.labels.length > 0;
}

export function getStatusMessage(opts: {
  status: BatchStatus;
  files: UploadedFile[];
  matchMode: MatchMode;
  expected: ExpectedLabel;
  csvParsed: CsvParseResult | null;
  matchStatus: MatchStatus;
  busy: boolean;
}): string {
  if (opts.status.kind === "loading") {
    return `Analyzed ${opts.status.processed} of ${opts.status.total} labels...`;
  }
  if (opts.busy) return `Analyzing ${opts.files.length} labels...`;
  if (opts.files.length === 0) return "Add at least one image to begin.";
  if (opts.matchMode === "shared" && !hasAnyExpected(opts.expected)) {
    return "Enter at least one declared field to enable analysis.";
  }
  if (opts.matchMode === "per-file") {
    return perFileStatus(opts.csvParsed, opts.matchStatus);
  }
  return `Ready to analyze ${opts.files.length} label${opts.files.length === 1 ? "" : "s"}.`;
}

function hasAnyExpected(expected: ExpectedLabel): boolean {
  return Boolean(
    expected.brand_name.trim() ||
      expected.class_type.trim() ||
      expected.alcohol_content.trim() ||
      expected.net_contents.trim(),
  );
}

function perFileStatus(
  csvParsed: CsvParseResult | null,
  matchStatus: MatchStatus,
): string {
  if (!csvParsed) return "Upload a CSV with per-label expected fields.";
  if (!csvParsed.ok) return "Fix the CSV errors before analyzing.";
  const unmatched = matchStatus?.unmatched.length ?? 0;
  if (unmatched > 0) return `${unmatched} image${unmatched === 1 ? " has" : "s have"} no matching CSV row.`;
  return "Ready to analyze matched labels.";
}
