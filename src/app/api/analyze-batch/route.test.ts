/**
 * Integration tests for POST /api/analyze-batch.
 *
 * Same shape as the single-label route tests: call POST directly with a
 * constructed `Request`, force `StubExtractor` via the test hook, drive
 * verdicts by filename (the stub keys off filename → fixture).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST, BATCH_CONCURRENCY } from "./route";
import { StubExtractor, type VisionExtractor, type ExtractInput } from "@/lib/vision";
import { setExtractorForTesting } from "@/lib/extractor-factory";
import type { BatchAnalyzeResponse, ExpectedLabel, ExtractedLabel } from "@/lib/types";

const HAPPY_EXPECTED: ExpectedLabel = {
  brand_name: "Old Tom Distillery",
  class_type: "Straight Bourbon Whiskey",
  alcohol_content: "45% ABV",
  net_contents: "750 mL",
  government_warning_required: true,
};

function buildRequest(filenames: string[], expected: ExpectedLabel | string): Request {
  const form = new FormData();
  for (const name of filenames) {
    form.append("image", new File([new Uint8Array([0])], name, { type: "image/png" }));
  }
  form.set(
    "expected",
    typeof expected === "string" ? expected : JSON.stringify(expected),
  );
  return new Request("http://localhost/api/analyze-batch", { method: "POST", body: form });
}

beforeEach(() => {
  setExtractorForTesting(new StubExtractor());
});
afterEach(() => {
  setExtractorForTesting(null);
});

describe("POST /api/analyze-batch — happy path", () => {
  it("returns 200 + correct shape for a single-image batch", async () => {
    const res = await POST(buildRequest(["ok.png"], HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as BatchAnalyzeResponse;
    expect(body.labels).toHaveLength(1);
    expect(body.labels[0].filename).toBe("ok.png");
    expect(body.labels[0].id).toBe("0-ok.png");
    expect(body.labels[0].result.verdict).toBe("Pass");
    expect(body.summary).toEqual({
      total: 1,
      pass: 1,
      needs_review: 0,
      fail: 0,
      unreadable: 0,
    });
  });

  it("aggregates a mixed-verdict batch and preserves upload order", async () => {
    // 5 fixtures hitting all four verdict buckets:
    //   ok.png               → Pass
    //   abv-mismatch.png     → Fail (ABV mismatch)
    //   missing-warning.png  → Fail (warning missing)
    //   lowercase-warning.png→ Fail (warning lowercase)
    //   low-quality.png      → Pass (values match; notes survive)
    const filenames = [
      "ok.png",
      "abv-mismatch.png",
      "missing-warning.png",
      "lowercase-warning.png",
      "low-quality.png",
    ];
    const res = await POST(buildRequest(filenames, HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as BatchAnalyzeResponse;

    // Order preserved.
    expect(body.labels.map((l) => l.filename)).toEqual(filenames);
    expect(body.labels.map((l) => l.id)).toEqual([
      "0-ok.png",
      "1-abv-mismatch.png",
      "2-missing-warning.png",
      "3-lowercase-warning.png",
      "4-low-quality.png",
    ]);

    // Verdict per slot.
    expect(body.labels[0].result.verdict).toBe("Pass");
    expect(body.labels[1].result.verdict).toBe("Fail");
    expect(body.labels[2].result.verdict).toBe("Fail");
    expect(body.labels[3].result.verdict).toBe("Fail");
    expect(body.labels[4].result.verdict).toBe("Pass");

    // Summary matches.
    expect(body.summary).toEqual({
      total: 5,
      pass: 2,
      needs_review: 0,
      fail: 3,
      unreadable: 0,
    });
  });

  it("rolls a per-image extractor failure up to verdict: 'Unreadable' (no 500)", async () => {
    // Throw on one specific filename; pass through to default fixtures otherwise.
    const flaky: VisionExtractor = {
      async extract(input: ExtractInput): Promise<ExtractedLabel> {
        if (input.filename === "boom.png") {
          throw new Error("simulated per-image extractor failure");
        }
        return new StubExtractor().extract(input);
      },
    };
    setExtractorForTesting(flaky);

    const res = await POST(buildRequest(["ok.png", "boom.png", "ok.png"], HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as BatchAnalyzeResponse;
    expect(body.labels[0].result.verdict).toBe("Pass");
    expect(body.labels[1].result.verdict).toBe("Unreadable");
    expect(body.labels[2].result.verdict).toBe("Pass");
    expect(body.summary).toEqual({
      total: 3,
      pass: 2,
      needs_review: 0,
      fail: 0,
      unreadable: 1,
    });
  });
});

describe("POST /api/analyze-batch — validation errors", () => {
  it("returns 400 when no 'image' parts are present", async () => {
    const form = new FormData();
    form.set("expected", JSON.stringify(HAPPY_EXPECTED));
    const req = new Request("http://localhost/api/analyze-batch", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/image/i);
  });

  it("returns 400 when 'expected' is not valid JSON", async () => {
    const res = await POST(buildRequest(["ok.png"], "not json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });

  it("returns 400 when 'expected' is JSON but doesn't match the schema", async () => {
    const res = await POST(buildRequest(["ok.png"], JSON.stringify({ brand_name: "x" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/schema/i);
  });
});

describe("POST /api/analyze-batch — per-filename expected (multi-product batches)", () => {
  /**
   * `expectedByFilename` is the realistic batch flow: each label in the
   * batch is a different product (importer dumps 200 applications at once),
   * so each image needs its OWN expected fields. Keyed by filename,
   * case-insensitive to match how real importer spreadsheets land.
   */

  function buildPerFilenameRequest(
    filenames: string[],
    expectedByFilename: Record<string, ExpectedLabel> | string,
  ): Request {
    const form = new FormData();
    for (const name of filenames) {
      form.append("image", new File([new Uint8Array([0])], name, { type: "image/png" }));
    }
    form.set(
      "expectedByFilename",
      typeof expectedByFilename === "string"
        ? expectedByFilename
        : JSON.stringify(expectedByFilename),
    );
    return new Request("http://localhost/api/analyze-batch", { method: "POST", body: form });
  }

  it("verifies each label against its own expected fields", async () => {
    // ok.png stub returns Old Tom @ 45% — we declare it as such (Pass).
    // abv-mismatch.png stub returns Old Tom @ 40% — we declare 40% (Pass).
    // missing-warning.png stub omits the warning — we declare warning required (Fail).
    const res = await POST(
      buildPerFilenameRequest(
        ["ok.png", "abv-mismatch.png", "missing-warning.png"],
        {
          "ok.png": HAPPY_EXPECTED,
          "abv-mismatch.png": { ...HAPPY_EXPECTED, alcohol_content: "40% ABV" },
          "missing-warning.png": HAPPY_EXPECTED,
        },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as BatchAnalyzeResponse;

    expect(body.labels[0].result.verdict).toBe("Pass");
    expect(body.labels[1].result.verdict).toBe("Pass"); // each row got its own ABV
    expect(body.labels[2].result.verdict).toBe("Fail"); // warning missing
    expect(body.summary).toEqual({
      total: 3,
      pass: 2,
      needs_review: 0,
      fail: 1,
      unreadable: 0,
    });
  });

  it("matches filename keys case-insensitively", async () => {
    const res = await POST(
      buildPerFilenameRequest(["OK.PNG"], { "ok.png": HAPPY_EXPECTED }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as BatchAnalyzeResponse;
    expect(body.labels[0].result.verdict).toBe("Pass");
  });

  it("returns 400 listing unmatched filenames when an image has no row", async () => {
    const res = await POST(
      buildPerFilenameRequest(
        ["ok.png", "orphan.png"],
        { "ok.png": HAPPY_EXPECTED },
      ),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no matching row/i);
    expect(body.error).toContain("orphan.png");
  });

  it("returns 400 when expectedByFilename is not valid JSON", async () => {
    const res = await POST(buildPerFilenameRequest(["ok.png"], "{not json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });

  it("returns 400 when expectedByFilename is empty {}", async () => {
    const res = await POST(buildPerFilenameRequest(["ok.png"], {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at least one/i);
  });

  it("returns 400 when neither expected nor expectedByFilename is provided", async () => {
    const form = new FormData();
    form.append("image", new File([new Uint8Array([0])], "ok.png", { type: "image/png" }));
    const req = new Request("http://localhost/api/analyze-batch", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expected/i);
  });

  it("returns 400 when BOTH expected and expectedByFilename are provided", async () => {
    const form = new FormData();
    form.append("image", new File([new Uint8Array([0])], "ok.png", { type: "image/png" }));
    form.set("expected", JSON.stringify(HAPPY_EXPECTED));
    form.set("expectedByFilename", JSON.stringify({ "ok.png": HAPPY_EXPECTED }));
    const req = new Request("http://localhost/api/analyze-batch", {
      method: "POST",
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not both/i);
  });
});

describe("POST /api/analyze-batch — concurrency cap", () => {
  it(`never runs more than ${BATCH_CONCURRENCY} extractor calls in flight`, async () => {
    // Instrumented extractor: track concurrent in-flight count, hold each
    // call briefly so the cap actually has a chance to bind.
    let inFlight = 0;
    let peak = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const probe: VisionExtractor = {
      async extract(): Promise<ExtractedLabel> {
        inFlight++;
        if (inFlight > peak) peak = inFlight;
        try {
          await sleep(15);
          return { brand_name: "x", raw_text: "x" };
        } finally {
          inFlight--;
        }
      },
    };
    setExtractorForTesting(probe);

    const filenames = Array.from({ length: 20 }, (_, i) => `n${i}.png`);
    const res = await POST(buildRequest(filenames, HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as BatchAnalyzeResponse;
    expect(body.labels).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(BATCH_CONCURRENCY);
    expect(peak).toBeGreaterThan(1); // Sanity: parallelism actually happened.
  });
});
