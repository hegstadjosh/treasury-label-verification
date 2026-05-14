/**
 * Selects which `VisionExtractor` implementation the route should use.
 *
 * Default: `StubExtractor` — no network calls, no spend.
 * Real Gemini wiring lands in iter-3; this factory will grow a branch then.
 *
 * The opt-in env flag is `USE_REAL_VISION=1`. Even with `GEMINI_API_KEY`
 * set, the stub is used unless that flag is on — so CI and local tests
 * never accidentally hit the live API.
 */

import { StubExtractor, type VisionExtractor } from "./vision";

let override: VisionExtractor | null = null;

/** Test hook: force the route to use a specific extractor. */
export function setExtractorForTesting(ex: VisionExtractor | null): void {
  override = ex;
}

export function getExtractor(): VisionExtractor {
  if (override) return override;
  // Iter-3 will branch here on `process.env.USE_REAL_VISION === "1"`.
  return new StubExtractor();
}
