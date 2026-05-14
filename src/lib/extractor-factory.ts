/**
 * Selects which `VisionExtractor` implementation the route should use.
 *
 * Default: `StubExtractor` — no network calls, no spend. CI and local tests
 * stay deterministic and free.
 *
 * Real Gemini is opt-in: both `USE_REAL_VISION=1` AND a non-empty
 * `GEMINI_API_KEY` must be set. Either alone falls back to the stub. That
 * combination is what production runs with.
 *
 * `setExtractorForTesting` is a test-only override used by the integration
 * tests in `route.test.ts`.
 */

import { GeminiVisionExtractor, StubExtractor, type VisionExtractor } from "./vision";

let override: VisionExtractor | null = null;

/** Test hook: force the route to use a specific extractor. */
export function setExtractorForTesting(ex: VisionExtractor | null): void {
  override = ex;
}

export function getExtractor(): VisionExtractor {
  if (override) return override;

  const useReal = process.env.USE_REAL_VISION === "1";
  const apiKey = process.env.GEMINI_API_KEY;
  if (useReal && apiKey) {
    return new GeminiVisionExtractor({ apiKey });
  }
  return new StubExtractor();
}
