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
export { GeminiVisionExtractor } from "./gemini-vision";

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
