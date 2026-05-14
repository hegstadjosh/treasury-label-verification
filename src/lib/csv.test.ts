import { describe, it, expect } from "vitest";
import { parseCsv, parseExpectedByFilenameCsv } from "./csv";

describe("parseCsv", () => {
  it("splits a plain comma-separated grid", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with embedded commas", () => {
    expect(parseCsv('name,desc\n"Smith, Inc","Wine, Sparkling"')).toEqual([
      ["name", "desc"],
      ["Smith, Inc", "Wine, Sparkling"],
    ]);
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    expect(parseCsv('x\n"He said ""hi"""')).toEqual([["x"], ['He said "hi"']]);
  });

  it("handles \\r\\n line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserves empty trailing fields", () => {
    expect(parseCsv("a,b,c\n1,,3")).toEqual([
      ["a", "b", "c"],
      ["1", "", "3"],
    ]);
  });

  it("handles a single row with no trailing newline", () => {
    expect(parseCsv("only")).toEqual([["only"]]);
  });
});

describe("parseExpectedByFilenameCsv", () => {
  const HEADER =
    "filename,brand_name,class_type,alcohol_content,net_contents,government_warning_required";

  it("parses a well-formed CSV", () => {
    const csv = `${HEADER}
ok.png,Old Tom Distillery,Straight Bourbon Whiskey,45% ABV,750 mL,true
two.png,Crisp Vineyards,Cabernet Sauvignon,13.5% ABV,750 mL,true`;
    const res = parseExpectedByFilenameCsv(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toEqual({
      filename: "ok.png",
      expected: {
        brand_name: "Old Tom Distillery",
        class_type: "Straight Bourbon Whiskey",
        alcohol_content: "45% ABV",
        net_contents: "750 mL",
        government_warning_required: true,
      },
    });
    expect(res.byFilename["ok.png"]).toBeDefined();
    expect(res.byFilename["two.png"]).toBeDefined();
  });

  it("lowercases the byFilename keys for case-insensitive match", () => {
    const csv = `${HEADER}\nOK.PNG,X,Y,5%,750 mL,true`;
    const res = parseExpectedByFilenameCsv(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.byFilename["ok.png"]).toBeDefined();
    expect(res.byFilename["OK.PNG"]).toBeUndefined();
  });

  it("defaults government_warning_required to true when omitted", () => {
    const csv = `filename,brand_name,class_type,alcohol_content,net_contents
ok.png,X,Y,5%,750 mL`;
    const res = parseExpectedByFilenameCsv(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows[0].expected.government_warning_required).toBe(true);
  });

  it("rejects 'false' or '0' for government_warning_required", () => {
    const csv = `${HEADER}\nok.png,X,Y,5%,750 mL,false`;
    const res = parseExpectedByFilenameCsv(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows[0].expected.government_warning_required).toBe(false);
  });

  it("returns a friendly error when a required column is missing", () => {
    const csv = `filename,brand_name,class_type,alcohol_content
ok.png,X,Y,5%`;
    const res = parseExpectedByFilenameCsv(csv);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/net_contents/);
  });

  it("rejects empty CSV input", () => {
    expect(parseExpectedByFilenameCsv("   ").ok).toBe(false);
  });

  it("rejects header-only CSV", () => {
    const res = parseExpectedByFilenameCsv(HEADER);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/data row/i);
  });

  it("rejects duplicate filenames (case-insensitive)", () => {
    const csv = `${HEADER}
ok.png,X,Y,5%,750 mL,true
OK.PNG,A,B,6%,750 mL,true`;
    const res = parseExpectedByFilenameCsv(csv);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/duplicate/i);
  });

  it("skips trailing blank rows (Excel quirk)", () => {
    const csv = `${HEADER}\nok.png,X,Y,5%,750 mL,true\n\n`;
    const res = parseExpectedByFilenameCsv(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(1);
  });

  it("tolerates quoted fields with commas (real importer spreadsheet)", () => {
    const csv = `${HEADER}
"smith.png","Smith, Inc","Wine, Sparkling","12% ABV","750 mL","true"`;
    const res = parseExpectedByFilenameCsv(csv);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows[0].expected.brand_name).toBe("Smith, Inc");
    expect(res.rows[0].expected.class_type).toBe("Wine, Sparkling");
  });
});
