import { describe, it, expect } from "vitest";
import { classifyLabel } from "./classify";
import type { ExpectedLabel, ExtractedLabel, FieldResult } from "./types";

const baseExpected: ExpectedLabel = {
  brand_name: "Old Tom Distillery",
  class_type: "Kentucky Straight Bourbon Whiskey",
  alcohol_content: "45% Alc./Vol.",
  net_contents: "750 mL",
};

const cleanExtracted: ExtractedLabel = {
  brand_name: "Old Tom Distillery",
  class_type: "Kentucky Straight Bourbon Whiskey",
  alcohol_content: "45% Alc./Vol. (90 Proof)",
  net_contents: "750 mL",
  government_warning:
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not " +
    "drink alcoholic beverages during pregnancy because of the risk of birth defects. " +
    "(2) Consumption of alcoholic beverages impairs your ability to drive a car or " +
    "operate machinery, and may cause health problems.",
};

describe("classifyLabel — verdict rollup", () => {
  it("Pass when every field passes", () => {
    const r = classifyLabel(baseExpected, cleanExtracted);
    expect(r.verdict).toBe("Pass");
    expect(r.top_reason).toBe("");
  });

  it("Fail when ANY field fails (precedence: Fail > Needs Review > Pass)", () => {
    const extracted: ExtractedLabel = { ...cleanExtracted, brand_name: "Wrong Brand" };
    const r = classifyLabel(baseExpected, extracted);
    expect(r.verdict).toBe("Fail");
    expect(r.top_reason.toLowerCase()).toContain("brand");
  });

  it("Needs Review when any field is Needs Review and none fail", () => {
    const extracted: ExtractedLabel = { ...cleanExtracted, brand_name: undefined };
    const r = classifyLabel(baseExpected, extracted);
    expect(r.verdict).toBe("Needs Review");
  });

  it("a failing government warning fails the whole label", () => {
    const extracted: ExtractedLabel = {
      ...cleanExtracted,
      government_warning: "Government Warning: drink responsibly",
    };
    const r = classifyLabel(baseExpected, extracted);
    expect(r.verdict).toBe("Fail");
    expect(r.top_reason.toLowerCase()).toContain("warning");
  });

  it("Fail beats Needs Review when both are present", () => {
    const extracted: ExtractedLabel = {
      ...cleanExtracted,
      brand_name: "Wrong Brand",
      net_contents: undefined,
    };
    const r = classifyLabel(baseExpected, extracted);
    expect(r.verdict).toBe("Fail");
  });
});

describe("classifyLabel — fields array", () => {
  it("returns one FieldResult per Field (brand, class/type, ABV, net, warning)", () => {
    const r = classifyLabel(baseExpected, cleanExtracted);
    expect(r.fields).toHaveLength(5);
    const fields = r.fields.map((f: FieldResult) => f.field);
    expect(fields).toContain("brand_name");
    expect(fields).toContain("class_type");
    expect(fields).toContain("alcohol_content");
    expect(fields).toContain("net_contents");
    expect(fields).toContain("government_warning");
  });

  it("carries the extracted label through on the result", () => {
    const r = classifyLabel(baseExpected, cleanExtracted);
    expect(r.extracted).toBe(cleanExtracted);
  });

  it("top_reason names the first failing field for Fail rollups", () => {
    const extracted: ExtractedLabel = { ...cleanExtracted, alcohol_content: "20%" };
    const r = classifyLabel(baseExpected, extracted);
    expect(r.verdict).toBe("Fail");
    expect(r.top_reason.toLowerCase()).toMatch(/abv|alcohol/);
  });

  it("top_reason names the first Needs-Review field when nothing fails", () => {
    const extracted: ExtractedLabel = { ...cleanExtracted, class_type: undefined };
    const r = classifyLabel(baseExpected, extracted);
    expect(r.verdict).toBe("Needs Review");
    expect(r.top_reason.toLowerCase()).toMatch(/class|type/);
  });
});

describe("classifyLabel — unreadable extraction", () => {
  it("returns Unreadable when the extractor signaled total failure", () => {
    const r = classifyLabel(baseExpected, { notes: "image unreadable" }, { unreadable: true });
    expect(r.verdict).toBe("Unreadable");
    expect(r.top_reason.toLowerCase()).toContain("unreadable");
  });
});
