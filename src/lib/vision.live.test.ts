/**
 * Live smoke test — hits the real Gemini API. Gated by RUN_LIVE_TESTS=1 so
 * CI and ordinary `npm test` never burn API budget. Run locally with:
 *
 *   RUN_LIVE_TESTS=1 npm test src/lib/vision.live.test.ts
 *
 * The only assertions are coarse end-to-end shape checks: the extractor
 * returns an object with the headline fields populated. Exact text matching
 * is left to the (deterministic) unit tests on warning/compare/classify; the
 * point here is to verify the wire format against the real API surface and
 * confirm the canonical happy-path label round-trips into a Pass when
 * paired with the matching ExpectedLabel.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GeminiVisionExtractor } from "./vision";
import { classifyLabel } from "./classify";

const LIVE = process.env.RUN_LIVE_TESTS === "1";

describe.runIf(LIVE)("GeminiVisionExtractor (live smoke)", () => {
  let extractor: GeminiVisionExtractor;
  let bytes: Uint8Array;

  beforeAll(() => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY must be set for live tests.");
    extractor = new GeminiVisionExtractor({ apiKey: key, timeoutMs: 30_000 });

    const fixturePath = resolve(
      __dirname,
      "../../test-fixtures/labels/old-tom-distillery.png",
    );
    bytes = new Uint8Array(readFileSync(fixturePath));
  });

  it(
    "extracts the canonical OLD TOM DISTILLERY fields",
    { timeout: 45_000 },
    async () => {
      const out = await extractor.extract({
        bytes,
        mimeType: "image/png",
        filename: "old-tom-distillery.png",
      });
      expect(out.brand_name?.toLowerCase()).toContain("old tom");
      expect(out.class_type?.toLowerCase()).toContain("bourbon");
      expect(out.alcohol_content).toMatch(/45/);
      expect(out.net_contents?.toLowerCase()).toContain("750");
      expect(out.government_warning).toMatch(/^GOVERNMENT WARNING:/);
      expect(out.raw_text?.length ?? 0).toBeGreaterThan(50);
    },
  );

  it(
    "pairs with a matching ExpectedLabel to produce Pass",
    { timeout: 45_000 },
    async () => {
      const out = await extractor.extract({
        bytes,
        mimeType: "image/png",
        filename: "old-tom-distillery.png",
      });
      const result = classifyLabel(
        {
          brand_name: "OLD TOM DISTILLERY",
          class_type: "Kentucky Straight Bourbon Whiskey",
          alcohol_content: "45% Alc./Vol. (90 Proof)",
          net_contents: "750 mL",
          government_warning_required: true,
        },
        out,
      );
      expect(result.verdict).toBe("Pass");
    },
  );
});
