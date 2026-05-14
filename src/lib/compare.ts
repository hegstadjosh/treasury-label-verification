/**
 * Field comparison.
 *
 * Pure functions: expected + extracted in, FieldResult out.
 *
 * Forgiveness rules — Dave Morrison's "STONE'S THROW" vs "Stone's Throw"
 * shouldn't be flagged. The model and the form will disagree on case,
 * smart quotes, and whitespace constantly. None of that is a real mismatch.
 *
 * Numeric fields (ABV, net contents) parse to numbers and compare with
 * a small tolerance — different formatting of the same value is a Pass.
 *
 * The government warning is NOT routed through here; it has its own
 * strict validator (warning.ts).
 */

import type { Field, FieldResult } from "./types";

/** ABV tolerance: matches the labeling tolerance the trade is used to. */
const ABV_TOLERANCE = 0.05;

/**
 * Canonical text normalization for "forgiving" comparison.
 * Lowercases, collapses whitespace, normalizes quotes and dashes,
 * strips outer punctuation. NOT used for the government warning.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'")     // curly apostrophes → '
    .replace(/[“”]/g, '"')           // curly quotes → "
    .replace(/[‐-―−]/g, "-")    // every dash variant → -
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.,;:!?\s]+|[.,;:!?\s]+$/g, ""); // strip outer punctuation
}

function ok(field: Field, expected: string, extracted: string, reason: string): FieldResult {
  return { field, expected, extracted, verdict: "Pass", reason };
}
function review(field: Field, expected: string, extracted: string, reason: string): FieldResult {
  return { field, expected, extracted, verdict: "Needs Review", reason };
}
function fail(field: Field, expected: string, extracted: string, reason: string): FieldResult {
  return { field, expected, extracted, verdict: "Fail", reason };
}

/** Compare a free-form text field (brand, class/type). */
export function compareField(
  field: Field,
  expected: string,
  extracted: string | undefined | null,
): FieldResult {
  const ex = expected ?? "";
  const got = extracted ?? "";

  if (ex.trim() === "") {
    return review(field, ex, got, "No expected value provided — needs reviewer judgment.");
  }
  if (got.trim() === "") {
    return review(field, ex, got, "Field not found on label — please confirm.");
  }

  if (normalizeText(ex) === normalizeText(got)) {
    return ok(field, ex, got, "Match (case/punctuation forgiven).");
  }

  return fail(field, ex, got, `Mismatch: expected "${ex}", extracted "${got}".`);
}

/** Pull the first percentage-style number out of an ABV string. */
function parseAbv(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)\s*%/);
  if (m) return parseFloat(m[1]);
  // Fallback: a bare number (e.g. "45.0" without %) — only if it's the only number.
  const bare = s.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  return bare ? parseFloat(bare[1]) : null;
}

export function compareAbv(
  expected: string,
  extracted: string | undefined | null,
): FieldResult {
  const ex = expected ?? "";
  const got = extracted ?? "";

  if (ex.trim() === "") {
    return review("alcohol_content", ex, got, "No expected ABV provided.");
  }
  if (got.trim() === "") {
    return review("alcohol_content", ex, got, "ABV not found on label — please confirm.");
  }

  const expectedAbv = parseAbv(ex);
  const extractedAbv = parseAbv(got);

  if (expectedAbv == null) {
    return review("alcohol_content", ex, got, "Could not parse expected ABV value.");
  }
  if (extractedAbv == null) {
    return review("alcohol_content", ex, got, "Could not parse a numeric ABV from extracted text.");
  }

  const diff = Math.abs(expectedAbv - extractedAbv);
  if (diff <= ABV_TOLERANCE) {
    return ok("alcohol_content", ex, got, `Match (${extractedAbv}% within ±${ABV_TOLERANCE}%).`);
  }
  return fail(
    "alcohol_content",
    ex,
    got,
    `ABV mismatch: expected ${expectedAbv}%, extracted ${extractedAbv}%.`,
  );
}

/**
 * Parse a net-contents string into (value, unit_in_mL_factor).
 * We standardize to mL internally so 1 L === 1000 mL.
 */
const UNIT_TO_ML: Record<string, number> = {
  ml: 1,
  l: 1000,
  cl: 10,
  // US labels rarely use fl oz on TTB forms, but include it for safety.
  "fl oz": 29.5735,
  oz: 29.5735,
};

function parseNetContents(s: string): { ml: number; rawUnit: string } | null {
  const lower = s.toLowerCase().replace(/\./g, "").trim();
  const m = lower.match(/(\d+(?:\.\d+)?)\s*(ml|cl|l|fl\s*oz|oz)\b/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  const unit = m[2].replace(/\s+/g, " ");
  const factor = UNIT_TO_ML[unit];
  if (factor == null) return null;
  return { ml: value * factor, rawUnit: unit };
}

export function compareNetContents(
  expected: string,
  extracted: string | undefined | null,
): FieldResult {
  const ex = expected ?? "";
  const got = extracted ?? "";

  if (ex.trim() === "") {
    return review("net_contents", ex, got, "No expected net contents provided.");
  }
  if (got.trim() === "") {
    return review("net_contents", ex, got, "Net contents not found on label — please confirm.");
  }

  const e = parseNetContents(ex);
  const g = parseNetContents(got);

  if (!e) return review("net_contents", ex, got, "Could not parse expected net contents.");
  if (!g) return review("net_contents", ex, got, "Could not parse extracted net contents.");

  // Allow 0.1% volume tolerance (round-off in floating point conversion).
  if (Math.abs(e.ml - g.ml) / e.ml < 0.001) {
    return ok("net_contents", ex, got, `Match (${g.ml.toFixed(0)} mL).`);
  }
  return fail(
    "net_contents",
    ex,
    got,
    `Net-contents mismatch: expected ${e.ml.toFixed(0)} mL, extracted ${g.ml.toFixed(0)} mL.`,
  );
}
