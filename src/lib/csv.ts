/**
 * Minimal RFC-4180-ish CSV parser. Handles:
 *   - Comma-separated values with optional double-quote wrapping
 *   - Escaped double-quotes inside quoted cells (`""` → `"`)
 *   - Embedded commas and newlines inside quoted cells
 *   - Trailing newline (ignored)
 *   - Empty trailing field (preserved as "")
 *
 * Deliberately small — no dependency, no streaming. Intended for the
 * importer-spreadsheet use case in this prototype: a single uploaded
 * file the reviewer is staring at. Pure function for easy testing.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      // swallow \r — treat \r\n and \n the same
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Last field / row (no trailing newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

import type { ExpectedLabel } from "./types";

/** Required CSV columns. `government_warning_required` is optional. */
const REQUIRED_COLUMNS = [
  "filename",
  "brand_name",
  "class_type",
  "alcohol_content",
  "net_contents",
] as const;

const OPTIONAL_COLUMNS = ["government_warning_required"] as const;

export interface ParsedExpectedRow {
  filename: string;
  expected: ExpectedLabel;
}

export type CsvParseResult =
  | { ok: true; rows: ParsedExpectedRow[]; byFilename: Record<string, ExpectedLabel> }
  | { ok: false; error: string };

/**
 * Parse a reviewer-uploaded CSV into `{ filename → ExpectedLabel }` plus the
 * ordered row list for preview rendering. Validates headers up front and
 * gives a friendly error message — the importer-spreadsheet reviewer is the
 * audience.
 */
export function parseExpectedByFilenameCsv(text: string): CsvParseResult {
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "The CSV is empty." };
  }

  const grid = parseCsv(trimmed);
  if (grid.length < 2) {
    return {
      ok: false,
      error: "CSV needs a header row followed by at least one data row.",
    };
  }

  const headers = grid[0].map((h) => h.trim().toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!headers.includes(required)) {
      return {
        ok: false,
        error: `CSV is missing the required column '${required}'. Expected headers: ${[...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].join(", ")}.`,
      };
    }
  }

  const idx = (col: string): number => headers.indexOf(col);

  const rows: ParsedExpectedRow[] = [];
  const byFilename: Record<string, ExpectedLabel> = {};

  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    // Skip empty trailing rows (common when Excel adds a blank line at the end)
    if (cells.every((c) => c.trim() === "")) continue;

    const filename = (cells[idx("filename")] ?? "").trim();
    if (filename === "") {
      return { ok: false, error: `Row ${r + 1}: 'filename' is empty.` };
    }

    const warningCell = (cells[idx("government_warning_required")] ?? "").trim().toLowerCase();
    const government_warning_required =
      warningCell === "" || warningCell === "true" || warningCell === "1" || warningCell === "yes";

    const expected: ExpectedLabel = {
      brand_name: (cells[idx("brand_name")] ?? "").trim(),
      class_type: (cells[idx("class_type")] ?? "").trim(),
      alcohol_content: (cells[idx("alcohol_content")] ?? "").trim(),
      net_contents: (cells[idx("net_contents")] ?? "").trim(),
      government_warning_required,
    };
    rows.push({ filename, expected });

    const key = filename.toLowerCase();
    if (byFilename[key]) {
      return {
        ok: false,
        error: `Row ${r + 1}: duplicate filename '${filename}' (case-insensitive).`,
      };
    }
    byFilename[key] = expected;
  }

  if (rows.length === 0) {
    return { ok: false, error: "CSV has a header but no data rows." };
  }
  return { ok: true, rows, byFilename };
}
