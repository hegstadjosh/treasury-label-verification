import type { CsvParseResult } from "@/lib/csv";
import type {
  BatchAnalyzeResponse,
  BatchLabelEntry,
  ExpectedLabel,
} from "@/lib/types";
import type { UploadedFile } from "@/components/uploadTypes";
import { CLIENT_REQUEST_BYTE_BUDGET } from "@/lib/upload-validation";
import type { BatchStatus, MatchMode } from "./batchAnalysisTypes";
import { CLIENT_CHUNK_SIZE, EMPTY_RESPONSE, EMPTY_SUMMARY } from "./batchAnalysisTypes";

type SetStatus = (status: BatchStatus) => void;
type StartTransition = (callback: () => void) => void;
interface AnalyzeChunksOptions {
  files: UploadedFile[];
  expected: ExpectedLabel;
  matchMode: MatchMode;
  csvParsed: CsvParseResult | null;
  setStatus: SetStatus;
  startTransition: StartTransition;
}

export async function analyzeChunks(opts: AnalyzeChunksOptions) {
  let merged: BatchLabelEntry[] = [];
  let summary = { ...EMPTY_SUMMARY };
  const total = opts.files.length;

  opts.startTransition(() => {
    opts.setStatus({ kind: "loading", processed: 0, total, partial: EMPTY_RESPONSE });
  });

  let processed = 0;
  for (const chunk of uploadChunks(opts.files)) {
    const batch = await postBatch(chunk, opts);
    if ("error" in batch) {
      opts.setStatus({ kind: "error", message: batch.error, partial: { labels: merged, summary } });
      return;
    }
    merged = [...merged, ...reindex(batch.labels, processed)];
    processed += chunk.length;
    summary = mergeSummary(summary, batch.summary, merged.length);
    publishProgress(opts, merged, summary, processed, total);
  }
}

function uploadChunks(files: UploadedFile[]): UploadedFile[][] {
  const chunks: UploadedFile[][] = [];
  let chunk: UploadedFile[] = [];
  let chunkBytes = 0;

  for (const upload of files) {
    const size = Math.max(upload.file.size, 1);
    const countLimitHit = chunk.length >= CLIENT_CHUNK_SIZE;
    const byteLimitHit =
      chunk.length > 0 && chunkBytes + size > CLIENT_REQUEST_BYTE_BUDGET;

    if (countLimitHit || byteLimitHit) {
      chunks.push(chunk);
      chunk = [];
      chunkBytes = 0;
    }

    chunk.push(upload);
    chunkBytes += size;
  }

  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

async function postBatch(
  chunk: UploadedFile[],
  opts: Pick<AnalyzeChunksOptions, "expected" | "matchMode" | "csvParsed">,
): Promise<BatchAnalyzeResponse | { error: string }> {
  const form = new FormData();
  for (const { file } of chunk) form.append("image", file);
  appendExpected(form, chunk, opts);
  try {
    const res = await fetch("/api/analyze-batch", { method: "POST", body: form });
    if (!res.ok) return { error: await responseError(res) };
    return (await res.json()) as BatchAnalyzeResponse;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Network error." };
  }
}

function appendExpected(
  form: FormData,
  chunk: UploadedFile[],
  opts: Pick<AnalyzeChunksOptions, "expected" | "matchMode" | "csvParsed">,
) {
  if (opts.matchMode === "shared") {
    form.append("expected", JSON.stringify(opts.expected));
    return;
  }
  form.append("expectedByFilename", JSON.stringify(expectedSubset(chunk, opts.csvParsed)));
}

function expectedSubset(
  chunk: UploadedFile[],
  csvParsed: CsvParseResult | null,
): Record<string, ExpectedLabel> {
  const byFilename = csvParsed?.ok ? csvParsed.byFilename : {};
  const subset: Record<string, ExpectedLabel> = {};
  for (const { file } of chunk) {
    const key = file.name.toLowerCase();
    if (byFilename[key]) subset[key] = byFilename[key];
  }
  return subset;
}

async function responseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || `Analyze failed (${res.status})`;
  } catch {
    return `Analyze failed (${res.status})`;
  }
}

function reindex(
  labels: BatchLabelEntry[],
  offset: number,
): BatchLabelEntry[] {
  return labels.map((entry, idx) => ({
    ...entry,
    id: `${offset + idx}-${entry.filename}`,
  }));
}

function mergeSummary(
  previous: typeof EMPTY_SUMMARY,
  next: BatchAnalyzeResponse["summary"],
  total: number,
) {
  return {
    total,
    pass: previous.pass + next.pass,
    needs_review: previous.needs_review + next.needs_review,
    fail: previous.fail + next.fail,
    unreadable: previous.unreadable + next.unreadable,
  };
}

function publishProgress(
  opts: Pick<AnalyzeChunksOptions, "setStatus" | "startTransition">,
  labels: BatchLabelEntry[],
  summary: typeof EMPTY_SUMMARY,
  processed: number,
  total: number,
) {
  const partial = { labels, summary };
  opts.startTransition(() => {
    opts.setStatus(
      processed >= total
        ? { kind: "done", response: partial }
        : { kind: "loading", processed, total, partial },
    );
  });
}
