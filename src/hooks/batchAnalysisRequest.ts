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

/**
 * Cap on how many client-side chunk requests are in flight at once.
 *
 * Each chunk maps to one POST to /api/analyze-batch, which itself fans out
 * up to BATCH_CONCURRENCY (8) extractor calls. So the maximum live
 * extractor calls = CLIENT_PARALLELISM × server cap. For 25 labels this
 * means ~32 concurrent Gemini calls — well within per-project QPS, but if
 * batches scale to 100+ labels we'd want to lower this or add a token
 * bucket. For prototype loads, parallel is just faster.
 */
const CLIENT_PARALLELISM = 4;

/**
 * Fire all chunks in parallel (bounded by CLIENT_PARALLELISM), surface
 * results to the UI as each chunk lands. Order in the queue is preserved
 * via the precomputed per-chunk offsets — when chunk K returns we splice
 * its results into the right slot, even if earlier chunks haven't returned
 * yet, so the table fills in as data arrives rather than waiting for a
 * strict in-order completion.
 */
export async function analyzeChunks(opts: AnalyzeChunksOptions) {
  const chunks = uploadChunks(opts.files);
  const total = opts.files.length;

  // Precompute each chunk's starting offset so reindex can run independently
  // of completion order.
  const offsets: number[] = [];
  let runningOffset = 0;
  for (const chunk of chunks) {
    offsets.push(runningOffset);
    runningOffset += chunk.length;
  }

  const chunkResults: (BatchAnalyzeResponse | null)[] = new Array(chunks.length).fill(null);
  let firstError: string | null = null;

  opts.startTransition(() => {
    opts.setStatus({ kind: "loading", processed: 0, total, partial: EMPTY_RESPONSE });
  });

  const publishCurrent = () => {
    const merged: BatchLabelEntry[] = [];
    let summary = { ...EMPTY_SUMMARY };
    let processed = 0;
    for (let i = 0; i < chunks.length; i++) {
      const r = chunkResults[i];
      if (!r) continue;
      merged.push(...reindex(r.labels, offsets[i]));
      summary = mergeSummary(summary, r.summary, merged.length);
      processed += chunks[i].length;
    }
    publishProgress(opts, merged, summary, processed, total);
  };

  // Bounded parallelism — keep at most CLIENT_PARALLELISM chunks in flight
  // at once. For our typical batch sizes this is effectively "all at once,"
  // but the cap prevents 100-label runs from blowing past Gemini QPS.
  const queue = chunks.map((chunk, i) => ({ chunk, i }));
  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const batch = await postBatch(next.chunk, opts);
      if ("error" in batch) {
        if (firstError === null) firstError = batch.error;
        continue;
      }
      chunkResults[next.i] = batch;
      publishCurrent();
    }
  }

  const workers = Array.from(
    { length: Math.min(CLIENT_PARALLELISM, chunks.length) },
    worker,
  );
  await Promise.all(workers);

  if (firstError !== null) {
    // Surface error, but keep whatever chunks DID succeed visible so the
    // reviewer can see partial progress rather than losing everything.
    const merged: BatchLabelEntry[] = [];
    let summary = { ...EMPTY_SUMMARY };
    for (let i = 0; i < chunks.length; i++) {
      const r = chunkResults[i];
      if (!r) continue;
      merged.push(...reindex(r.labels, offsets[i]));
      summary = mergeSummary(summary, r.summary, merged.length);
    }
    opts.setStatus({
      kind: "error",
      message: firstError,
      partial: { labels: merged, summary },
    });
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
