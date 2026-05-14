/**
 * Roll per-field results up to a single label verdict.
 *
 * Precedence (from the brief + spec):
 *   - any Fail            → Fail
 *   - else any Needs Review → Needs Review
 *   - else                → Pass
 *
 * `Unreadable` is a separate top-level state — used when the extractor
 * itself failed (no image, OCR returned nothing usable). It is never
 * derived from per-field verdicts; the caller signals it explicitly.
 */

import type {
  ComplianceField,
  ExpectedLabel,
  ExtractedLabel,
  Field,
  FieldResult,
  LabelResult,
  LabelVerdict,
} from "./types";
import { compareField, compareAbv, compareNetContents } from "./compare";
import { applyExtractionQualityPolicy } from "./extraction-quality";
import { checkGovernmentWarning } from "./warning";

/** Order the UI renders fields and the order top_reason walks. */
const FIELD_ORDER: ComplianceField[] = [
  "brand_name",
  "class_type",
  "alcohol_content",
  "net_contents",
  "government_warning",
];

export interface ClassifyOptions {
  /** True if the extractor reports it could not read the image at all. */
  unreadable?: boolean;
}

function evaluateField(
  field: ComplianceField,
  expected: ExpectedLabel,
  extracted: ExtractedLabel,
): FieldResult {
  switch (field) {
    case "brand_name":
      return compareField("brand_name", expected.brand_name, extracted.brand_name);
    case "class_type":
      return compareField("class_type", expected.class_type, extracted.class_type);
    case "alcohol_content":
      return compareAbv(expected.alcohol_content, extracted.alcohol_content);
    case "net_contents":
      return compareNetContents(expected.net_contents, extracted.net_contents);
    case "government_warning": {
      const required = expected.government_warning_required ?? true;
      if (!required) {
        return {
          field: "government_warning",
          expected: "(not required)",
          extracted: extracted.government_warning ?? "",
          verdict: "Pass",
          reason: "Government warning marked as not required for this application.",
        };
      }
      const check = checkGovernmentWarning(extracted.government_warning);
      return {
        field: "government_warning",
        expected: "27 CFR §16.21 canonical text",
        extracted: extracted.government_warning ?? "",
        verdict: check.verdict,
        reason: check.reason,
      };
    }
  }
}

export function classifyLabel(
  expected: ExpectedLabel,
  extracted: ExtractedLabel,
  options: ClassifyOptions = {},
): LabelResult {
  if (options.unreadable) {
    return {
      verdict: "Unreadable",
      fields: [],
      top_reason: "Image was unreadable — extractor could not parse the label.",
      extracted,
    };
  }

  const fields = applyExtractionQualityPolicy(
    FIELD_ORDER.map((f) => evaluateField(f, expected, extracted)),
    extracted,
  );

  const firstFail = fields.find((f) => f.verdict === "Fail");
  const firstReview = fields.find((f) => f.verdict === "Needs Review");

  let verdict: LabelVerdict;
  let top_reason: string;
  if (firstFail) {
    verdict = "Fail";
    top_reason = `${labelOf(firstFail.field)}: ${firstFail.reason}`;
  } else if (firstReview) {
    verdict = "Needs Review";
    top_reason = `${labelOf(firstReview.field)}: ${firstReview.reason}`;
  } else {
    verdict = "Pass";
    top_reason = "";
  }

  return { verdict, fields, top_reason, extracted };
}

/** Pretty field name for top_reason. */
function labelOf(field: Field): string {
  switch (field) {
    case "brand_name":
      return "Brand name";
    case "class_type":
      return "Class/Type";
    case "alcohol_content":
      return "ABV";
    case "net_contents":
      return "Net contents";
    case "government_warning":
      return "Government warning";
    case "image_quality":
      return "Image quality";
  }
}
