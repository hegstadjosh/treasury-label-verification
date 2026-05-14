// Sentinel test so `npm run check` runs vitest cleanly during iter 0.
// Replaced by real tests in iter 1.
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
