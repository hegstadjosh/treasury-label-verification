/**
 * POST /api/analyze-batch
 *
 * Request: multipart/form-data
 *   - image:    one or more File parts (all named "image"; collected via
 *               `form.getAll("image")`). The order they appear in the form
 *               is the order of the response.
 *   - expected: string (JSON-encoded ExpectedLabel — applies to ALL images
 *               in the batch).
 *
 * Response:
 *   - 200 + BatchAnalyzeResponse JSON. EVERY image slot resolves to a
 *     LabelResult, INCLUDING extractor failures (which become
 *     verdict: "Unreadable"). No per-image error short-circuits the batch.
 *   - 400 + { error } JSON for malformed requests: zero images, bad
 *     expected JSON, schema-invalid expected.
 *   - 500 only for unexpected server bugs (not vision failure).
 *
 * Concurrency: up to BATCH_CONCURRENCY extractor calls run in parallel.
 * Output order matches input order — slot `i` of `labels` always
 * corresponds to the `i`th uploaded image, never completion order.
 */

import { z } from "zod";
import { getExtractor } from "@/lib/extractor-factory";
import { classifyLabel } from "@/lib/classify";
import { mapWithConcurrency } from "@/lib/batch";
import type {
  BatchAnalyzeResponse,
  BatchLabelEntry,
  BatchSummary,
  ExpectedLabel,
  LabelResult,
} from "@/lib/types";

/**
 * Cap on in-flight extractor calls per batch request. Picked to fit comfortably
 * inside Gemini's per-project QPS and Vercel serverless event-loop budget while
 * still hiding most per-label latency behind parallelism. Tune here.
 */
export const BATCH_CONCURRENCY = 8;

const ExpectedLabelSchema = z.object({
  brand_name: z.string(),
  class_type: z.string(),
  alcohol_content: z.string(),
  net_contents: z.string(),
  government_warning_required: z.boolean().optional(),
});

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Request body must be multipart/form-data.");
  }

  const imageParts = form.getAll("image").filter((p): p is File => p instanceof File);
  if (imageParts.length === 0) {
    return badRequest("At least one 'image' file part is required.");
  }

  const expectedRaw = form.get("expected");
  if (typeof expectedRaw !== "string" || expectedRaw === "") {
    return badRequest("Missing 'expected' part (JSON-encoded ExpectedLabel).");
  }

  let expectedJson: unknown;
  try {
    expectedJson = JSON.parse(expectedRaw);
  } catch {
    return badRequest("'expected' is not valid JSON.");
  }

  const parsed = ExpectedLabelSchema.safeParse(expectedJson);
  if (!parsed.success) {
    return badRequest(
      `'expected' does not match ExpectedLabel schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  const expected: ExpectedLabel = parsed.data;

  const extractor = getExtractor();

  const labels = await mapWithConcurrency(
    imageParts,
    BATCH_CONCURRENCY,
    async (image, index): Promise<BatchLabelEntry> => {
      const bytes = new Uint8Array(await image.arrayBuffer());
      let result: LabelResult;
      try {
        const extracted = await extractor.extract({
          bytes,
          mimeType: image.type || "application/octet-stream",
          filename: image.name,
        });
        result = classifyLabel(expected, extracted);
      } catch {
        // Per-image extractor failure → Unreadable, NOT 500. Mirrors the
        // single-label route's contract so batch and single behave the same.
        result = classifyLabel(expected, {}, { unreadable: true });
      }
      return {
        id: `${index}-${image.name}`,
        filename: image.name,
        result,
      };
    },
  );

  const summary = summarize(labels);
  const body: BatchAnalyzeResponse = { labels, summary };
  return Response.json(body, { status: 200 });
}

function summarize(labels: readonly BatchLabelEntry[]): BatchSummary {
  const counts: BatchSummary = {
    total: labels.length,
    pass: 0,
    needs_review: 0,
    fail: 0,
    unreadable: 0,
  };
  for (const { result } of labels) {
    switch (result.verdict) {
      case "Pass":
        counts.pass++;
        break;
      case "Needs Review":
        counts.needs_review++;
        break;
      case "Fail":
        counts.fail++;
        break;
      case "Unreadable":
        counts.unreadable++;
        break;
    }
  }
  return counts;
}
