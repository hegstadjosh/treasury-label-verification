/**
 * POST /api/analyze-batch
 *
 * Request: multipart/form-data
 *   - image: one or more File parts (all named "image"; collected via
 *            `form.getAll("image")`). The order they appear in the form is
 *            the order of the response.
 *   - Either `expected` OR `expectedByFilename` (exactly one):
 *       - `expected`: JSON-encoded ExpectedLabel that applies to ALL images
 *                     in the batch (same-product mode).
 *       - `expectedByFilename`: JSON-encoded `Record<string, ExpectedLabel>`
 *                     keyed by image filename (case-insensitive). Each image
 *                     is matched to its own expected fields — the realistic
 *                     "200 importer applications" workflow. Every uploaded
 *                     image MUST have a matching entry, else 400.
 *
 * Response:
 *   - 200 + BatchAnalyzeResponse JSON. EVERY image slot resolves to a
 *     LabelResult, INCLUDING extractor failures (which become
 *     verdict: "Unreadable"). No per-image error short-circuits the batch.
 *   - 400 + { error } JSON for malformed requests: zero images, missing or
 *     conflicting expected/expectedByFilename, bad JSON, schema-invalid
 *     entries, or images without a matching expectedByFilename row.
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

const ExpectedByFilenameSchema = z.record(z.string(), ExpectedLabelSchema);

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
  const expectedByFilenameRaw = form.get("expectedByFilename");

  const hasExpected = typeof expectedRaw === "string" && expectedRaw !== "";
  const hasExpectedByFilename =
    typeof expectedByFilenameRaw === "string" && expectedByFilenameRaw !== "";

  if (!hasExpected && !hasExpectedByFilename) {
    return badRequest(
      "Provide either 'expected' (JSON ExpectedLabel) or 'expectedByFilename' (JSON Record<filename, ExpectedLabel>).",
    );
  }
  if (hasExpected && hasExpectedByFilename) {
    return badRequest(
      "Provide either 'expected' or 'expectedByFilename', not both.",
    );
  }

  // Resolve a (filename → ExpectedLabel) lookup that works for both modes.
  let lookup: (filename: string) => ExpectedLabel | null;

  if (hasExpected) {
    let json: unknown;
    try {
      json = JSON.parse(expectedRaw as string);
    } catch {
      return badRequest("'expected' is not valid JSON.");
    }
    const parsed = ExpectedLabelSchema.safeParse(json);
    if (!parsed.success) {
      return badRequest(
        `'expected' does not match ExpectedLabel schema: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ")}`,
      );
    }
    const sharedExpected = parsed.data;
    lookup = () => sharedExpected;
  } else {
    let json: unknown;
    try {
      json = JSON.parse(expectedByFilenameRaw as string);
    } catch {
      return badRequest("'expectedByFilename' is not valid JSON.");
    }
    const parsed = ExpectedByFilenameSchema.safeParse(json);
    if (!parsed.success) {
      return badRequest(
        `'expectedByFilename' does not match Record<string, ExpectedLabel>: ${parsed.error.issues
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
          .join("; ")}`,
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return badRequest("'expectedByFilename' must contain at least one entry.");
    }

    // Build a case-insensitive map. Real importer spreadsheets are inconsistent.
    const byLower = new Map<string, ExpectedLabel>();
    for (const [key, value] of Object.entries(parsed.data)) {
      byLower.set(key.toLowerCase(), value);
    }

    // Every uploaded image must have a matching row. Otherwise the reviewer
    // has a CSV/image mismatch — surface it loudly rather than silently
    // dropping or auto-failing labels.
    const unmatched: string[] = [];
    for (const image of imageParts) {
      if (!byLower.has(image.name.toLowerCase())) {
        unmatched.push(image.name);
      }
    }
    if (unmatched.length > 0) {
      return badRequest(
        `${unmatched.length} uploaded image${unmatched.length === 1 ? " has" : "s have"} no matching row in 'expectedByFilename': ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? ", …" : ""}`,
      );
    }

    lookup = (filename: string) => byLower.get(filename.toLowerCase()) ?? null;
  }

  const extractor = getExtractor();

  const labels = await mapWithConcurrency(
    imageParts,
    BATCH_CONCURRENCY,
    async (image, index): Promise<BatchLabelEntry> => {
      const expected = lookup(image.name);
      if (!expected) {
        // Guard: lookup miss should have been caught above for the per-filename
        // mode, and is impossible for the shared mode. Belt-and-braces.
        const fallback: ExpectedLabel = {
          brand_name: "",
          class_type: "",
          alcohol_content: "",
          net_contents: "",
        };
        return {
          id: `${index}-${image.name}`,
          filename: image.name,
          result: classifyLabel(fallback, {}, { unreadable: true }),
        };
      }
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
