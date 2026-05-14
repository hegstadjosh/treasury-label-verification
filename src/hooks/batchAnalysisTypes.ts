import type { BatchAnalyzeResponse, ExpectedLabel } from "@/lib/types";

export type MatchMode = "shared" | "per-file";

export type BatchStatus =
  | { kind: "idle" }
  | { kind: "loading"; processed: number; total: number; partial: BatchAnalyzeResponse }
  | { kind: "error"; message: string; partial: BatchAnalyzeResponse }
  | { kind: "done"; response: BatchAnalyzeResponse };

export const EMPTY_EXPECTED: ExpectedLabel = {
  brand_name: "",
  class_type: "",
  alcohol_content: "",
  net_contents: "",
  government_warning_required: true,
};

export const EMPTY_SUMMARY = {
  total: 0,
  pass: 0,
  needs_review: 0,
  fail: 0,
  unreadable: 0,
};

export const EMPTY_RESPONSE: BatchAnalyzeResponse = {
  labels: [],
  summary: EMPTY_SUMMARY,
};

export const CLIENT_CHUNK_SIZE = 8;
