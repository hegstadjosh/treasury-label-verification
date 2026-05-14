import type { ExtractInput, VisionExtractor } from "./vision";
import type { ComplianceField, ExtractedLabel } from "./types";

export class GeminiVisionExtractor implements VisionExtractor {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;
  private endpoint: string;

  constructor(opts: {
    apiKey: string;
    model?: string;
    timeoutMs?: number;
    endpoint?: string;
  }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gemini-3.1-flash-lite";
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.endpoint =
      opts.endpoint ??
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
  }

  async extract(input: ExtractInput): Promise<ExtractedLabel> {
    if (!input.bytes || input.bytes.length === 0) {
      throw new Error("GeminiVisionExtractor: missing image bytes.");
    }
    const raw = await this.callGemini(input);
    return parseGeminiLabel(raw);
  }

  private async callGemini(input: ExtractInput): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(requestBody(input)),
        signal: controller.signal,
      });
      return await responseText(res);
    } finally {
      clearTimeout(timer);
    }
  }
}

function requestBody(input: ExtractInput) {
  return {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: imageMime(input), data: imageBase64(input) } },
          { text: EXTRACTION_PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  };
}

function imageMime(input: ExtractInput): string {
  return input.mimeType?.startsWith("image/") ? input.mimeType : "image/png";
}

function imageBase64(input: ExtractInput): string {
  return Buffer.from(input.bytes ?? new Uint8Array()).toString("base64");
}

async function responseText(res: Response): Promise<string> {
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status} ${res.statusText}: ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as GeminiResponse;
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!raw) throw new Error("Gemini returned no text part.");
  return raw;
}

function parseGeminiLabel(raw: string): ExtractedLabel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini response was not valid JSON: ${raw.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Gemini response JSON was not an object.");
  }
  const o = parsed as Record<string, unknown>;
  return {
    brand_name: str(o.brand_name),
    class_type: str(o.class_type),
    alcohol_content: str(o.alcohol_content),
    net_contents: str(o.net_contents),
    government_warning: str(o.government_warning),
    raw_text: str(o.raw_text),
    notes: str(o.notes),
    confidence: parseConfidence(o.confidence),
  };
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const CONFIDENCE_FIELDS = [
  "brand_name",
  "class_type",
  "alcohol_content",
  "net_contents",
  "government_warning",
] as const satisfies readonly ComplianceField[];

function parseConfidence(value: unknown): ExtractedLabel["confidence"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const out: Partial<Record<ComplianceField, number>> = {};
  const record = value as Record<string, unknown>;
  for (const field of CONFIDENCE_FIELDS) {
    const raw = record[field];
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1) {
      out[field] = raw;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

const EXTRACTION_PROMPT = `You are reading an alcohol beverage label submitted to the US Treasury Department's Alcohol and Tobacco Tax and Trade Bureau (TTB).

Extract the following fields exactly as they appear on the label, preserving capitalization, punctuation, and wording:
- brand_name: the brand or producer name shown most prominently on the label
- class_type: the class/type designation
- alcohol_content: the alcohol-by-volume statement
- net_contents: the net contents statement
- government_warning: the FULL verbatim government health warning block, INCLUDING "GOVERNMENT WARNING:" exactly as printed. Omit if absent.
- raw_text: every readable piece of text on the label, in roughly top-to-bottom reading order.
- notes: ONE short sentence about image-quality issues. If the image is clean, omit this field.
- confidence: object with 0.0-1.0 confidence scores for brand_name, class_type, alcohol_content, net_contents, government_warning.

Return JSON only.`;

const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    brand_name: { type: "string" },
    class_type: { type: "string" },
    alcohol_content: { type: "string" },
    net_contents: { type: "string" },
    government_warning: { type: "string" },
    raw_text: { type: "string" },
    notes: { type: "string" },
    confidence: {
      type: "object",
      properties: {
        brand_name: { type: "number" },
        class_type: { type: "number" },
        alcohol_content: { type: "number" },
        net_contents: { type: "number" },
        government_warning: { type: "number" },
      },
    },
  },
  required: ["raw_text"],
};
