import type { FieldVerdict, LabelVerdict } from "@/lib/types";

type Verdict = LabelVerdict | FieldVerdict;

const STYLES: Record<Verdict, string> = {
  Pass: "bg-emerald-100 text-emerald-900 ring-emerald-300",
  "Needs Review": "bg-amber-100 text-amber-900 ring-amber-300",
  Fail: "bg-rose-100 text-rose-900 ring-rose-300",
  Unreadable: "bg-slate-200 text-slate-800 ring-slate-400",
};

export function VerdictBadge({
  verdict,
  size = "md",
}: {
  verdict: Verdict;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses =
    size === "lg"
      ? "px-4 py-2 text-base"
      : size === "md"
        ? "px-3 py-1 text-sm"
        : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-md font-semibold uppercase tracking-wide ring-1 ring-inset ${STYLES[verdict]} ${sizeClasses}`}
    >
      {verdict}
    </span>
  );
}
