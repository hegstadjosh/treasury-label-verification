import { describe, it, expect } from "vitest";
import { compareField, compareAbv, compareNetContents, normalizeText } from "./compare";

/**
 * Comparison of "regular" fields — brand name, class/type, ABV, net contents.
 * The government warning has its own strict validator in warning.ts.
 *
 * Forgiveness rules (from Dave Morrison interview + brief):
 *   - Case-insensitive
 *   - Whitespace runs collapse
 *   - Smart quotes / apostrophes / hyphens normalize
 *   - Trailing periods, surrounding punctuation forgiven
 *   - ABV compared as numbers within ±0.05% absolute tolerance
 *   - Net contents normalize unit (mL = ml = ML), compared as numbers
 */

describe("normalizeText", () => {
  it("lowercases", () => {
    expect(normalizeText("STONE'S THROW")).toBe(normalizeText("stone's throw"));
  });

  it("treats curly and straight apostrophes the same", () => {
    expect(normalizeText("Stone’s Throw")).toBe(normalizeText("Stone's Throw"));
  });

  it("collapses internal whitespace", () => {
    expect(normalizeText("Old   Tom   Distillery")).toBe(normalizeText("Old Tom Distillery"));
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeText("  Old Tom  ")).toBe(normalizeText("Old Tom"));
  });

  it("treats em-dash, en-dash and hyphen as equivalent", () => {
    expect(normalizeText("Pinot—Noir")).toBe(normalizeText("Pinot-Noir"));
    expect(normalizeText("Pinot–Noir")).toBe(normalizeText("Pinot-Noir"));
  });
});

describe("compareField — text", () => {
  it("passes on exact match", () => {
    const r = compareField("brand_name", "Old Tom Distillery", "Old Tom Distillery");
    expect(r.verdict).toBe("Pass");
  });

  it("passes on case difference (the Stone's Throw case)", () => {
    const r = compareField("brand_name", "Stone's Throw", "STONE'S THROW");
    expect(r.verdict).toBe("Pass");
  });

  it("passes on smart-quote vs straight-quote", () => {
    const r = compareField("brand_name", "Stone's Throw", "Stone’s Throw");
    expect(r.verdict).toBe("Pass");
  });

  it("passes when extracted has a trailing period", () => {
    const r = compareField("class_type", "Kentucky Straight Bourbon Whiskey", "Kentucky Straight Bourbon Whiskey.");
    expect(r.verdict).toBe("Pass");
  });

  it("flags as Needs Review when extracted is missing", () => {
    const r = compareField("brand_name", "Old Tom Distillery", undefined);
    expect(r.verdict).toBe("Needs Review");
    expect(r.reason.toLowerCase()).toContain("not");
  });

  it("flags as Needs Review when extracted is empty string", () => {
    expect(compareField("brand_name", "Old Tom Distillery", "").verdict).toBe("Needs Review");
  });

  it("fails on a clearly different brand name", () => {
    const r = compareField("brand_name", "Old Tom Distillery", "New Crow Distillery");
    expect(r.verdict).toBe("Fail");
  });

  it("flags as Needs Review when expected is blank (nothing to compare against)", () => {
    const r = compareField("brand_name", "", "Old Tom Distillery");
    expect(r.verdict).toBe("Needs Review");
  });
});

describe("compareAbv", () => {
  it("passes when extracted matches expected exactly", () => {
    expect(compareAbv("45% Alc./Vol.", "45% Alc./Vol. (90 Proof)").verdict).toBe("Pass");
  });

  it("passes when both contain the same numeric value with different formatting", () => {
    expect(compareAbv("45% Alc./Vol.", "45.00% ABV").verdict).toBe("Pass");
  });

  it("passes when the difference is within ±0.05% tolerance", () => {
    expect(compareAbv("45%", "45.04%").verdict).toBe("Pass");
  });

  it("fails when the difference is just outside tolerance", () => {
    expect(compareAbv("45%", "45.1%").verdict).toBe("Fail");
  });

  it("fails on a clear ABV mismatch", () => {
    expect(compareAbv("45%", "12%").verdict).toBe("Fail");
  });

  it("Needs Review when no number can be parsed from extracted", () => {
    expect(compareAbv("45%", "alc by volume").verdict).toBe("Needs Review");
  });

  it("Needs Review when extracted is missing", () => {
    expect(compareAbv("45%", undefined).verdict).toBe("Needs Review");
  });
});

describe("compareNetContents", () => {
  it("passes on identical strings", () => {
    expect(compareNetContents("750 mL", "750 mL").verdict).toBe("Pass");
  });

  it("normalizes the unit (mL = ml = ML)", () => {
    expect(compareNetContents("750 mL", "750 ml").verdict).toBe("Pass");
    expect(compareNetContents("750 mL", "750ML").verdict).toBe("Pass");
  });

  it("forgives missing space between number and unit", () => {
    expect(compareNetContents("750 mL", "750mL").verdict).toBe("Pass");
  });

  it("fails on a different volume", () => {
    expect(compareNetContents("750 mL", "1 L").verdict).toBe("Fail");
  });

  it("fails on the same number but different unit family", () => {
    // 750 mL vs 750 L is not a casing issue, it's a real volume mismatch.
    expect(compareNetContents("750 mL", "750 L").verdict).toBe("Fail");
  });

  it("Needs Review when extracted is missing", () => {
    expect(compareNetContents("750 mL", undefined).verdict).toBe("Needs Review");
  });
});
