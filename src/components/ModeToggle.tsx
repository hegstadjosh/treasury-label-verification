"use client";

import type { MatchMode } from "@/hooks/useBatchAnalysis";

const OPTIONS: Array<{ value: MatchMode; label: string; sub: string }> = [
  {
    value: "shared",
    label: "Same for all",
    sub: "One product, many photos",
  },
  {
    value: "per-file",
    label: "Per-label CSV",
    sub: "Multiple applications, each with its own fields",
  },
];

export function ModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: MatchMode;
  onChange: (mode: MatchMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-1 sm:flex-row">
      {OPTIONS.map((opt) => (
        <ModeButton
          key={opt.value}
          option={opt}
          selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function ModeButton({
  option,
  selected,
  onClick,
  disabled,
}: {
  option: (typeof OPTIONS)[number];
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={
        "rounded px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 " +
        (selected
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
          : "text-slate-600 hover:text-slate-900")
      }
    >
      <div className="font-medium">{option.label}</div>
      <div className="text-xs text-slate-500">{option.sub}</div>
    </button>
  );
}
