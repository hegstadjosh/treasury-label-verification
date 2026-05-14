/**
 * Shared types for the label-verification pipeline.
 *
 * The data flow is:
 *   ExpectedLabel (from the applicant)         ──┐
 *                                                ├─► compareField per field ─► FieldResult[]
 *   ExtractedLabel (from VisionExtractor)       ──┘                                  │
 *                                                                                    ▼
 *                                                                              classifyLabel
 *                                                                                    │
 *                                                                                    ▼
 *                                                                              LabelResult
 */

/** Canonical set of fields the reviewer cares about. */
export type Field =
  | "brand_name"
  | "class_type"
  | "alcohol_content"
  | "net_contents"
  | "government_warning";

/** Per-field verdict from comparison. */
export type FieldVerdict = "Pass" | "Needs Review" | "Fail";

/** Rolled-up label verdict. `Unreadable` is reserved for extractor failure. */
export type LabelVerdict = "Pass" | "Needs Review" | "Fail" | "Unreadable";

/** What the applicant said the label says. Free-form strings; numeric parsing happens in compare. */
export interface ExpectedLabel {
  brand_name: string;
  class_type: string;
  alcohol_content: string;
  net_contents: string;
  /** Whether the applicant claims the government warning is present. Defaults to required (true). */
  government_warning_required?: boolean;
}

/** What the vision model said it saw on the label. All fields optional — model may fail to find any. */
export interface ExtractedLabel {
  brand_name?: string;
  class_type?: string;
  alcohol_content?: string;
  net_contents?: string;
  /** The full government warning text as read off the label, if present. */
  government_warning?: string;
  /** Raw OCR / visible text, kept for the audit trail. */
  raw_text?: string;
  /** Free-form notes the model emitted (image quality, low confidence, etc.). */
  notes?: string;
  /** Per-field confidence 0..1 if the model reported one. */
  confidence?: Partial<Record<Field, number>>;
}

/** One row of the audit trail. */
export interface FieldResult {
  field: Field;
  expected: string;
  extracted: string;
  verdict: FieldVerdict;
  /** Short human-readable reason. Reviewer sees this first. */
  reason: string;
}

/** Final per-label record handed back to the UI. */
export interface LabelResult {
  verdict: LabelVerdict;
  fields: FieldResult[];
  /** Top reason surfaced in the queue view. Empty for clean Pass. */
  top_reason: string;
  /** Carried through so the drill-down view can show what the model saw. */
  extracted: ExtractedLabel;
}
