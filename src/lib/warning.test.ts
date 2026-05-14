import { describe, it, expect } from "vitest";
import { CANONICAL_GOVERNMENT_WARNING, checkGovernmentWarning } from "./warning";

/**
 * The government warning is the only field with strict matching.
 * Source: 27 CFR §16.21. Two independent sources cross-checked
 * (Cornell LII + GovInfo CFR XML) before the canonical was frozen.
 *
 * Rules captured here:
 *   - "GOVERNMENT WARNING:" prefix must be uppercase and present.
 *   - Both (1) and (2) clauses must appear with canonical wording.
 *   - Whitespace runs (newlines, tabs, multiple spaces) collapse to a single space.
 *   - Internal punctuation must match (no extra/missing commas).
 *   - Title-case "Government Warning:" fails (Jenny Park interview).
 */

describe("CANONICAL_GOVERNMENT_WARNING", () => {
  it("starts with the uppercase prefix", () => {
    expect(CANONICAL_GOVERNMENT_WARNING.startsWith("GOVERNMENT WARNING:")).toBe(true);
  });

  it("contains both numbered clauses", () => {
    expect(CANONICAL_GOVERNMENT_WARNING).toContain("(1)");
    expect(CANONICAL_GOVERNMENT_WARNING).toContain("(2)");
  });

  it("mentions the Surgeon General and birth defects", () => {
    expect(CANONICAL_GOVERNMENT_WARNING).toContain("Surgeon General");
    expect(CANONICAL_GOVERNMENT_WARNING).toContain("birth defects");
  });

  it("mentions impaired driving and health problems", () => {
    expect(CANONICAL_GOVERNMENT_WARNING).toContain("drive a car or operate machinery");
    expect(CANONICAL_GOVERNMENT_WARNING).toContain("health problems");
  });
});

describe("checkGovernmentWarning", () => {
  it("passes on the exact canonical text", () => {
    const result = checkGovernmentWarning(CANONICAL_GOVERNMENT_WARNING);
    expect(result.verdict).toBe("Pass");
  });

  it("forgives newlines inside the warning (labels often wrap)", () => {
    const wrapped =
      "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not\n" +
      "drink alcoholic beverages during pregnancy because of the risk of birth defects.\n" +
      "(2) Consumption of alcoholic beverages impairs your ability to drive a car or\n" +
      "operate machinery, and may cause health problems.";
    expect(checkGovernmentWarning(wrapped).verdict).toBe("Pass");
  });

  it("forgives multiple internal spaces", () => {
    const padded = CANONICAL_GOVERNMENT_WARNING.replace(/ /g, "  ");
    expect(checkGovernmentWarning(padded).verdict).toBe("Pass");
  });

  it("forgives leading and trailing whitespace", () => {
    const padded = "   \n" + CANONICAL_GOVERNMENT_WARNING + "  \t\n";
    expect(checkGovernmentWarning(padded).verdict).toBe("Pass");
  });

  it("fails on title-case prefix 'Government Warning:'", () => {
    const titlecase = CANONICAL_GOVERNMENT_WARNING.replace(
      "GOVERNMENT WARNING:",
      "Government Warning:",
    );
    const result = checkGovernmentWarning(titlecase);
    expect(result.verdict).toBe("Fail");
    expect(result.reason.toLowerCase()).toContain("uppercase");
  });

  it("fails on lowercase prefix 'government warning:'", () => {
    const lower = CANONICAL_GOVERNMENT_WARNING.replace(
      "GOVERNMENT WARNING:",
      "government warning:",
    );
    expect(checkGovernmentWarning(lower).verdict).toBe("Fail");
  });

  it("fails when the prefix is missing entirely", () => {
    const stripped = CANONICAL_GOVERNMENT_WARNING.replace("GOVERNMENT WARNING: ", "");
    const result = checkGovernmentWarning(stripped);
    expect(result.verdict).toBe("Fail");
    expect(result.reason.toLowerCase()).toContain("prefix");
  });

  it("fails on a paraphrased version", () => {
    const paraphrased =
      "GOVERNMENT WARNING: (1) Pregnant women should not consume alcohol due to " +
      "birth defect risk. (2) Drinking impairs driving and operating machinery and may harm health.";
    expect(checkGovernmentWarning(paraphrased).verdict).toBe("Fail");
  });

  it("fails when clause (1) is missing", () => {
    const missing1 =
      "GOVERNMENT WARNING: (2) Consumption of alcoholic beverages impairs your " +
      "ability to drive a car or operate machinery, and may cause health problems.";
    expect(checkGovernmentWarning(missing1).verdict).toBe("Fail");
  });

  it("fails when clause (2) is missing", () => {
    const missing2 =
      "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not " +
      "drink alcoholic beverages during pregnancy because of the risk of birth defects.";
    expect(checkGovernmentWarning(missing2).verdict).toBe("Fail");
  });

  it("fails on missing comma after 'Surgeon General'", () => {
    const noComma = CANONICAL_GOVERNMENT_WARNING.replace(
      "Surgeon General,",
      "Surgeon General",
    );
    expect(checkGovernmentWarning(noComma).verdict).toBe("Fail");
  });

  it("fails on empty string", () => {
    expect(checkGovernmentWarning("").verdict).toBe("Fail");
  });

  it("fails on undefined / missing input", () => {
    expect(checkGovernmentWarning(undefined).verdict).toBe("Fail");
  });
});
