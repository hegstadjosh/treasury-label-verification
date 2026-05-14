import type { ComplianceField, ExtractedLabel, Field, FieldResult } from "./types";

export const LOW_CONFIDENCE_THRESHOLD = 0.75;

const QUALITY_ISSUE_RE =
  /glare|blur|low|poor|dark|lighting|shadow|occlu|partial|obscur|angle|skew|crop|cut off|unread/i;

export function applyExtractionQualityPolicy(
  fields: readonly FieldResult[],
  extracted: ExtractedLabel,
): FieldResult[] {
  const adjusted = fields.map((field) => applyConfidencePolicy(field, extracted));
  const quality = imageQualityResult(extracted.notes);
  return quality ? [...adjusted, quality] : adjusted;
}

function applyConfidencePolicy(
  field: FieldResult,
  extracted: ExtractedLabel,
): FieldResult {
  if (field.verdict !== "Pass") return field;
  const confidence = confidenceFor(extracted, field.field);
  if (confidence == null || confidence >= LOW_CONFIDENCE_THRESHOLD) return field;
  return {
    ...field,
    verdict: "Needs Review",
    reason: `Low model confidence (${confidence.toFixed(2)}). ${field.reason}`,
  };
}

function confidenceFor(extracted: ExtractedLabel, field: Field): number | null {
  if (!isComplianceField(field)) return null;
  const value = extracted.confidence?.[field];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function isComplianceField(field: Field): field is ComplianceField {
  return field !== "image_quality";
}

function imageQualityResult(notes: string | undefined): FieldResult | null {
  const text = notes?.trim();
  if (!text || !QUALITY_ISSUE_RE.test(text)) return null;
  return {
    field: "image_quality",
    expected: "Readable label image",
    extracted: text,
    verdict: "Needs Review",
    reason: "Model reported an image-quality concern; confirm extracted text.",
  };
}
