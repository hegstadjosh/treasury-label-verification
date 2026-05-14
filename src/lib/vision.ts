/**
 * Vision-extraction adapter.
 *
 * The route handler depends on the `VisionExtractor` interface, not on any
 * concrete model — that's the swap point for Azure OCR / Azure OpenAI / a
 * second cloud model later.
 *
 * `StubExtractor` returns canned fixtures keyed by either an explicit `key`
 * or by the uploaded filename. It exists so the integration tests can run
 * the full route end-to-end in CI with zero network calls and zero spend.
 */

import type { ExtractedLabel } from "./types";
import { CANONICAL_GOVERNMENT_WARNING } from "./warning";

export interface ExtractInput {
  /** Raw image bytes, when extracting from a real upload. */
  bytes?: Uint8Array;
  /** MIME type — needed by real vision models. */
  mimeType?: string;
  /** Original filename — the stub uses this to pick a fixture. */
  filename?: string;
  /** Explicit fixture key — bypasses filename lookup, useful in tests. */
  key?: FixtureKey;
}

export interface VisionExtractor {
  extract(input: ExtractInput): Promise<ExtractedLabel>;
}

export type FixtureKey =
  | "ok"
  | "abv-mismatch"
  | "missing-warning"
  | "lowercase-warning"
  | "low-quality"
  | "throw";

const DEFAULT_FIXTURES: Record<FixtureKey, ExtractedLabel> = {
  ok: {
    brand_name: "Old Tom Distillery",
    class_type: "Straight Bourbon Whiskey",
    alcohol_content: "45% ABV",
    net_contents: "750 mL",
    government_warning: CANONICAL_GOVERNMENT_WARNING,
    raw_text:
      "OLD TOM DISTILLERY\nStraight Bourbon Whiskey\n45% ABV (90 PROOF)\n750 mL\n" +
      CANONICAL_GOVERNMENT_WARNING,
  },
  "abv-mismatch": {
    brand_name: "Old Tom Distillery",
    class_type: "Straight Bourbon Whiskey",
    alcohol_content: "40% ABV",
    net_contents: "750 mL",
    government_warning: CANONICAL_GOVERNMENT_WARNING,
    raw_text:
      "OLD TOM DISTILLERY\nStraight Bourbon Whiskey\n40% ABV (80 PROOF)\n750 mL\n" +
      CANONICAL_GOVERNMENT_WARNING,
  },
  "missing-warning": {
    brand_name: "Old Tom Distillery",
    class_type: "Straight Bourbon Whiskey",
    alcohol_content: "45% ABV",
    net_contents: "750 mL",
    raw_text:
      "OLD TOM DISTILLERY\nStraight Bourbon Whiskey\n45% ABV (90 PROOF)\n750 mL",
  },
  "lowercase-warning": {
    brand_name: "Old Tom Distillery",
    class_type: "Straight Bourbon Whiskey",
    alcohol_content: "45% ABV",
    net_contents: "750 mL",
    // Lowercase prefix — must be caught by the warning validator.
    government_warning:
      "government warning: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.",
  },
  "low-quality": {
    brand_name: "Old Tom Distillery",
    class_type: "Straight Bourbon Whiskey",
    alcohol_content: "45% ABV",
    net_contents: "750 mL",
    government_warning: CANONICAL_GOVERNMENT_WARNING,
    notes: "Image quality low — partial glare on label, ABV digits partially obscured.",
    confidence: {
      brand_name: 0.6,
      alcohol_content: 0.45,
      government_warning: 0.8,
    },
  },
  // Sentinel: the test suite triggers this to verify the route's error path.
  throw: {},
};

/** Map a raw filename to a fixture key. Case-insensitive, extension-stripped. */
function filenameToKey(filename: string): FixtureKey | null {
  const base = filename.toLowerCase().replace(/\.[a-z0-9]+$/, "");
  const valid: FixtureKey[] = [
    "ok",
    "abv-mismatch",
    "missing-warning",
    "lowercase-warning",
    "low-quality",
  ];
  return (valid as string[]).includes(base) ? (base as FixtureKey) : null;
}

export class StubExtractor implements VisionExtractor {
  private fixtures: Record<FixtureKey, ExtractedLabel>;

  constructor(overrides: Partial<Record<FixtureKey, ExtractedLabel>> = {}) {
    this.fixtures = { ...DEFAULT_FIXTURES, ...overrides };
  }

  async extract(input: ExtractInput): Promise<ExtractedLabel> {
    const key =
      input.key ?? (input.filename ? filenameToKey(input.filename) : null) ?? "ok";

    if (key === "throw") {
      throw new Error("StubExtractor: simulated extractor failure.");
    }
    return this.fixtures[key];
  }
}

/**
 * Real Gemini-backed extractor. Sends the image + a strict JSON schema to a
 * Flash-tier model and parses back an `ExtractedLabel`.
 *
 * Throws on transport errors, timeout, safety blocks, or schema-invalid model
 * responses — the route catches and converts to `verdict: "Unreadable"`.
 *
 * Latency: ~7–9s warm against `gemini-3.1-flash-lite` for a ~1 MB image.
 * That exceeds the stakeholder-stated 5 s target — see the README for the
 * production-path mitigations (image preprocessing, regional endpoint,
 * batched UX where per-label latency is hidden by parallelism).
 */
export class GeminiVisionExtractor implements VisionExtractor {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;
  private endpoint: string;

  constructor(opts: {
    apiKey: string;
    model?: string;
    timeoutMs?: number;
    /** Override for testing. Defaults to the public Gemini endpoint. */
    endpoint?: string;
  }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gemini-3.1-flash-lite";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.endpoint =
      opts.endpoint ??
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  async extract(input: ExtractInput): Promise<ExtractedLabel> {
    if (!input.bytes || input.bytes.length === 0) {
      throw new Error("GeminiVisionExtractor: missing image bytes.");
    }

    const base64 = Buffer.from(input.bytes).toString("base64");
    const mimeType = input.mimeType?.startsWith("image/")
      ? input.mimeType
      : "image/png";

    const body = {
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let raw: string;
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          `Gemini API ${res.status} ${res.statusText}: ${txt.slice(0, 300)}`,
        );
      }

      const data = (await res.json()) as GeminiResponse;
      raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!raw) {
        throw new Error("Gemini returned no text part.");
      }
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Gemini response was not valid JSON: ${raw.slice(0, 200)}`);
    }

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Gemini response JSON was not an object.");
    }
    const o = parsed as Record<string, unknown>;
    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v.length > 0 ? v : undefined;

    return {
      brand_name: str(o.brand_name),
      class_type: str(o.class_type),
      alcohol_content: str(o.alcohol_content),
      net_contents: str(o.net_contents),
      government_warning: str(o.government_warning),
      raw_text: str(o.raw_text),
      notes: str(o.notes),
    };
  }
}

const EXTRACTION_PROMPT = `You are reading an alcohol beverage label submitted to the US Treasury Department's Alcohol and Tobacco Tax and Trade Bureau (TTB).

Extract the following fields exactly as they appear on the label, preserving capitalization, punctuation, and wording:
- brand_name: the brand or producer name shown most prominently on the label
- class_type: the class/type designation (e.g. "Kentucky Straight Bourbon Whiskey", "Cabernet Sauvignon", "Lager Beer")
- alcohol_content: the alcohol-by-volume statement (e.g. "45% Alc./Vol. (90 Proof)")
- net_contents: the net contents statement (e.g. "750 mL", "12 fl oz")
- government_warning: the FULL verbatim text of the government health warning block, INCLUDING the leading "GOVERNMENT WARNING:" phrase and its exact capitalization. Do not paraphrase, abbreviate, or "correct" the text — copy it character-for-character. If the warning is not present at all, omit this field.
- raw_text: every readable piece of text on the label, in roughly top-to-bottom reading order, separated by newlines or spaces.
- notes: ONE short sentence about any image-quality issues that could affect extraction confidence (glare, low resolution, partial occlusion, off-axis, blurry). If the image is clean, omit this field.

Return JSON only — no commentary, no markdown fences.`;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    brand_name: { type: "string" },
    class_type: { type: "string" },
    alcohol_content: { type: "string" },
    net_contents: { type: "string" },
    government_warning: { type: "string" },
    raw_text: { type: "string" },
    notes: { type: "string" },
  },
  required: ["raw_text"],
};
