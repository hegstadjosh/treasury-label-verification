/**
 * POST /api/analyze
 *
 * Request: multipart/form-data
 *   - image:    File (the label image)
 *   - expected: string (JSON-encoded ExpectedLabel)
 *
 * Response:
 *   - 200 + LabelResult JSON for any successful pipeline run, INCLUDING
 *     the case where the extractor fails — that returns 200 with
 *     verdict: "Unreadable". The UI treats Unreadable as a normal result
 *     row (it goes into the review queue), not a transport error. This
 *     keeps batch fan-out simple: every label slot resolves to a
 *     LabelResult, never a thrown promise.
 *   - 400 + { error } JSON for malformed requests (missing parts,
 *     bad expected JSON, schema-invalid expected).
 *   - 500 only for truly unexpected server-side failures (programming
 *     bugs). Vision-model failure is NOT 500.
 *
 * The handler is a thin orchestrator: parse → extract → classify → JSON.
 */

import { z } from "zod";
import { getExtractor } from "@/lib/extractor-factory";
import { classifyLabel } from "@/lib/classify";
import type { ExpectedLabel, LabelResult } from "@/lib/types";

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

  const image = form.get("image");
  const expectedRaw = form.get("expected");

  if (!(image instanceof File)) {
    return badRequest("Missing 'image' file part.");
  }
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
    // Extractor failure → Unreadable, NOT a 500. See header comment.
    result = classifyLabel(expected, {}, { unreadable: true });
  }

  return Response.json(result, { status: 200 });
}
