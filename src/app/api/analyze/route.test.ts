/**
 * Integration tests for POST /api/analyze.
 *
 * These tests call the route handler directly with a constructed `Request`
 * object — no HTTP server needed, no network. The vision layer is forced to
 * the `StubExtractor` via `setExtractorForTesting`, so canned fixtures drive
 * the assertions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "./route";
import { StubExtractor } from "@/lib/vision";
import { setExtractorForTesting } from "@/lib/extractor-factory";
import { MAX_IMAGE_BYTES } from "@/lib/upload-validation";
import type { ExpectedLabel, LabelResult } from "@/lib/types";

const HAPPY_EXPECTED: ExpectedLabel = {
  brand_name: "Old Tom Distillery",
  class_type: "Straight Bourbon Whiskey",
  alcohol_content: "45% ABV",
  net_contents: "750 mL",
  government_warning_required: true,
};

/** Build a multipart Request whose 'image' filename selects a StubExtractor fixture. */
function buildRequest(filename: string, expected: ExpectedLabel): Request {
  const form = new FormData();
  // Body content is irrelevant — the stub keys off the filename.
  form.set("image", new File([new Uint8Array([0])], filename, { type: "image/png" }));
  form.set("expected", JSON.stringify(expected));
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  setExtractorForTesting(new StubExtractor());
});
afterEach(() => {
  setExtractorForTesting(null);
});

describe("POST /api/analyze — happy path", () => {
  it("returns 200 + Pass for a clean label that matches the expected fields", async () => {
    const res = await POST(buildRequest("ok.png", HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as LabelResult;
    expect(body.verdict).toBe("Pass");
    expect(body.top_reason).toBe("");
    expect(body.fields.every((f) => f.verdict === "Pass")).toBe(true);
    expect(body.extracted.brand_name).toBe("Old Tom Distillery");
  });
});

describe("POST /api/analyze — failure cases", () => {
  it("returns 200 + Fail when the ABV on the label differs from the application", async () => {
    const res = await POST(buildRequest("abv-mismatch.png", HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as LabelResult;
    expect(body.verdict).toBe("Fail");
    expect(body.top_reason.toLowerCase()).toContain("abv");
    const abvField = body.fields.find((f) => f.field === "alcohol_content");
    expect(abvField?.verdict).toBe("Fail");
  });

  it("returns 200 + Fail when the government warning is missing", async () => {
    const res = await POST(buildRequest("missing-warning.png", HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as LabelResult;
    expect(body.verdict).toBe("Fail");
    const gw = body.fields.find((f) => f.field === "government_warning");
    expect(gw?.verdict).toBe("Fail");
    expect(gw?.reason.toLowerCase()).toContain("not found");
  });

  it("returns 200 + Fail when the government-warning prefix is lowercase", async () => {
    const res = await POST(buildRequest("lowercase-warning.png", HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as LabelResult;
    expect(body.verdict).toBe("Fail");
    const gw = body.fields.find((f) => f.field === "government_warning");
    expect(gw?.verdict).toBe("Fail");
    expect(gw?.reason).toMatch(/uppercase/i);
  });
});

describe("POST /api/analyze — quality + carry-through", () => {
  it("carries the vision model's notes through to the response for a low-quality image", async () => {
    const res = await POST(buildRequest("low-quality.png", HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as LabelResult;
    expect(body.verdict).toBe("Needs Review");
    expect(body.extracted.notes).toBeDefined();
    expect(body.extracted.confidence?.alcohol_content).toBeLessThan(1);
  });

  it("returns 200 + Unreadable when the extractor throws", async () => {
    // Force the extractor to throw on this call.
    setExtractorForTesting({
      extract: async () => {
        throw new Error("simulated model error");
      },
    });
    const res = await POST(buildRequest("ok.png", HAPPY_EXPECTED));
    expect(res.status).toBe(200);
    const body = (await res.json()) as LabelResult;
    expect(body.verdict).toBe("Unreadable");
    expect(body.fields).toEqual([]);
    expect(body.top_reason.toLowerCase()).toContain("unreadable");
  });
});

describe("POST /api/analyze — validation errors", () => {
  it("returns 400 when the 'image' part is missing", async () => {
    const form = new FormData();
    form.set("expected", JSON.stringify(HAPPY_EXPECTED));
    const req = new Request("http://localhost/api/analyze", { method: "POST", body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/image/i);
  });

  it("returns 400 when the image MIME type is not supported", async () => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array([1])], "label.gif", { type: "image/gif" }));
    form.set("expected", JSON.stringify(HAPPY_EXPECTED));
    const req = new Request("http://localhost/api/analyze", { method: "POST", body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/png|jpg/i);
  });

  it("returns 400 when the image exceeds the per-file size limit", async () => {
    const form = new FormData();
    form.set(
      "image",
      new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "huge.png", { type: "image/png" }),
    );
    form.set("expected", JSON.stringify(HAPPY_EXPECTED));
    const req = new Request("http://localhost/api/analyze", { method: "POST", body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/limit/i);
  });

  it("returns 400 when the 'expected' part is not valid JSON", async () => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array([0])], "ok.png", { type: "image/png" }));
    form.set("expected", "not json");
    const req = new Request("http://localhost/api/analyze", { method: "POST", body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });

  it("returns 400 when 'expected' is JSON but doesn't match the ExpectedLabel schema", async () => {
    const form = new FormData();
    form.set("image", new File([new Uint8Array([0])], "ok.png", { type: "image/png" }));
    // Missing required fields.
    form.set("expected", JSON.stringify({ brand_name: "Only Brand" }));
    const req = new Request("http://localhost/api/analyze", { method: "POST", body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/schema/i);
  });
});
