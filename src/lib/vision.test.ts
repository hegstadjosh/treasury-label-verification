import { describe, it, expect } from "vitest";
import { StubExtractor, type FixtureKey } from "./vision";
import { CANONICAL_GOVERNMENT_WARNING } from "./warning";

describe("StubExtractor", () => {
  it("returns a happy-path label for the 'ok' key", async () => {
    const ex = new StubExtractor();
    const out = await ex.extract({ key: "ok" });
    expect(out.brand_name).toBeTruthy();
    expect(out.class_type).toBeTruthy();
    expect(out.alcohol_content).toBeTruthy();
    expect(out.net_contents).toBeTruthy();
    expect(out.government_warning).toBe(CANONICAL_GOVERNMENT_WARNING);
  });

  it("'abv-mismatch' returns a label whose ABV differs from the canonical fixture", async () => {
    const ex = new StubExtractor();
    const ok = await ex.extract({ key: "ok" });
    const bad = await ex.extract({ key: "abv-mismatch" });
    expect(bad.alcohol_content).not.toBe(ok.alcohol_content);
  });

  it("'missing-warning' omits the government warning entirely", async () => {
    const ex = new StubExtractor();
    const out = await ex.extract({ key: "missing-warning" });
    expect(out.government_warning).toBeUndefined();
  });

  it("'lowercase-warning' uses lowercase 'government warning:' prefix", async () => {
    const ex = new StubExtractor();
    const out = await ex.extract({ key: "lowercase-warning" });
    expect(out.government_warning).toBeDefined();
    expect(out.government_warning!.startsWith("government warning:")).toBe(true);
    expect(out.government_warning!.startsWith("GOVERNMENT WARNING:")).toBe(false);
  });

  it("'low-quality' carries a 'notes' field flagging image-quality issues", async () => {
    const ex = new StubExtractor();
    const out = await ex.extract({ key: "low-quality" });
    expect(out.notes).toBeDefined();
    expect(out.notes!.toLowerCase()).toMatch(/quality|blurry|low/);
  });

  it("looks up by filename when no explicit key is given", async () => {
    const ex = new StubExtractor();
    const out = await ex.extract({ filename: "abv-mismatch.png" });
    const ok = await ex.extract({ filename: "ok.png" });
    expect(out.alcohol_content).not.toBe(ok.alcohol_content);
  });

  it("filename matching is case-insensitive and strips the extension", async () => {
    const ex = new StubExtractor();
    const out1 = await ex.extract({ filename: "OK.PNG" });
    const out2 = await ex.extract({ filename: "ok.jpg" });
    expect(out1.brand_name).toBe(out2.brand_name);
  });

  it("falls back to the 'ok' fixture for an unknown filename", async () => {
    const ex = new StubExtractor();
    const out = await ex.extract({ filename: "something-unrecognized.png" });
    expect(out.brand_name).toBeTruthy();
    expect(out.government_warning).toBe(CANONICAL_GOVERNMENT_WARNING);
  });

  it("throws when configured to simulate extractor failure", async () => {
    const ex = new StubExtractor();
    await expect(ex.extract({ key: "throw" as FixtureKey })).rejects.toThrow();
  });

  it("accepts a custom fixture map via the constructor", async () => {
    const custom = new StubExtractor({
      ok: { brand_name: "Custom Brand" },
    });
    const out = await custom.extract({ key: "ok" });
    expect(out.brand_name).toBe("Custom Brand");
  });
});
