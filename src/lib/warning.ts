/**
 * Government warning validator.
 *
 * The canonical text comes from 27 CFR §16.21 — the federal regulation that
 * defines the alcohol-beverage health warning. Verified against Cornell LII
 * and GovInfo CFR XML on 2026-05-14.
 *
 * Matching rules (derived from the brief + the Jenny Park interview):
 *   - "GOVERNMENT WARNING:" must appear EXACTLY (uppercase, with colon).
 *   - The two numbered clauses must appear with canonical wording.
 *   - Internal whitespace runs collapse to a single space (labels often wrap).
 *   - Leading/trailing whitespace is forgiven.
 *   - Internal punctuation must match — extra/missing commas fail.
 *
 * Everything else (case-insensitive matching, fuzzy similarity) is reserved
 * for the regular fields and lives in compare.ts.
 */

import type { FieldVerdict } from "./types";

export const CANONICAL_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

const PREFIX = "GOVERNMENT WARNING:";

export interface WarningCheck {
  verdict: FieldVerdict;
  reason: string;
}

/** Collapse all whitespace runs to single spaces, trim ends. */
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function checkGovernmentWarning(input: string | undefined | null): WarningCheck {
  if (input == null || input === "") {
    return { verdict: "Fail", reason: "Government warning not found on label." };
  }

  const normalized = normalizeWhitespace(input);

  // The prefix check is case-sensitive on purpose.
  if (!normalized.startsWith(PREFIX)) {
    if (normalized.toUpperCase().startsWith(PREFIX)) {
      return {
        verdict: "Fail",
        reason: '"GOVERNMENT WARNING:" must appear in uppercase.',
      };
    }
    return {
      verdict: "Fail",
      reason: 'Required prefix "GOVERNMENT WARNING:" is missing.',
    };
  }

  const canonical = normalizeWhitespace(CANONICAL_GOVERNMENT_WARNING);
  if (normalized === canonical) {
    return { verdict: "Pass", reason: "Matches canonical 27 CFR §16.21 wording." };
  }

  return {
    verdict: "Fail",
    reason: "Warning text does not match the canonical 27 CFR §16.21 wording.",
  };
}
