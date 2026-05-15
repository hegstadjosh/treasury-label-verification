import type { ExtractInput, VisionExtractor } from "./vision";
import type { ComplianceField, ExtractedLabel, SourceBox } from "./types";

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
    source_boxes: parseSourceBoxes(o.source_boxes),
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

const COMPLIANCE_FIELDS = new Set<ComplianceField>(CONFIDENCE_FIELDS);

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

function parseSourceBoxes(value: unknown): SourceBox[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const boxes: SourceBox[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const field = record.field;
    const box = parseBox(record.box_2d ?? record.box2d);

    if (
      typeof field !== "string" ||
      !COMPLIANCE_FIELDS.has(field as ComplianceField) ||
      !box
    ) {
      continue;
    }

    boxes.push({
      field: field as ComplianceField,
      label: str(record.label),
      box_2d: box,
    });
  }

  return boxes.length > 0 ? boxes : undefined;
}

function parseBox(value: unknown): SourceBox["box_2d"] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const nums = value.map((v) =>
    typeof v === "number" && Number.isFinite(v) ? v : null,
  );
  if (nums.some((v) => v == null)) return null;

  const [yMin, xMin, yMax, xMax] = nums as [number, number, number, number];
  if (yMax <= yMin || xMax <= xMin) return null;

  return [
    clampBoxValue(yMin),
    clampBoxValue(xMin),
    clampBoxValue(yMax),
    clampBoxValue(xMax),
  ];
}

function clampBoxValue(value: number): number {
  return Math.max(0, Math.min(1000, value));
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

const EXTRACTION_PROMPT = `You are reading an alcohol beverage label submitted to the US Treasury Department's Alcohol and Tobacco Tax and Trade Bureau (TTB).

Extract the following fields exactly as they appear on the label, preserving capitalization, punctuation, and wording. Always include every core field key; use an empty string only when that field is not visible on the label:
- brand_name: the brand or producer name shown most prominently on the label
- class_type: the class/type designation
- alcohol_content: the alcohol-by-volume statement
- net_contents: the net contents statement
- government_warning: the FULL verbatim government health warning block, INCLUDING "GOVERNMENT WARNING:" exactly as printed. Omit if absent.
- raw_text: every readable piece of text on the label, in roughly top-to-bottom reading order.
- notes: ONE short sentence about image-quality issues. If the image is clean, omit this field.
- confidence: object with 0.0-1.0 confidence scores for brand_name, class_type, alcohol_content, net_contents, government_warning.
- source_boxes: array of visual evidence boxes for the extracted fields when visible. Each item must include:
  - field: one of brand_name, class_type, alcohol_content, net_contents, government_warning
  - label: short display label
  - box_2d: normalized [y_min, x_min, y_max, x_max] coordinates from 0 to 1000.

Do not leave alcohol_content or government_warning empty if the text is readable in raw_text.

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
    source_boxes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          label: { type: "string" },
          box_2d: {
            type: "array",
            items: { type: "number" },
          },
        },
        required: ["field", "box_2d"],
      },
    },
  },
  required: [
    "brand_name",
    "class_type",
    "alcohol_content",
    "net_contents",
    "government_warning",
    "raw_text",
  ],
};
