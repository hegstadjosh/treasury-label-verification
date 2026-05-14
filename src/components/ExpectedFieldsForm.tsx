"use client";

import type { ExpectedLabel } from "@/lib/types";

export function ExpectedFieldsForm({
  value,
  onChange,
  disabled,
}: {
  value: ExpectedLabel;
  onChange: (next: ExpectedLabel) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof ExpectedLabel>(
    key: K,
    next: ExpectedLabel[K],
  ) => onChange({ ...value, [key]: next });

  return (
    <fieldset
      disabled={disabled}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <legend className="sr-only">Expected label fields</legend>

      <TextField
        id="brand_name"
        label="Brand name"
        placeholder="e.g. Old Tom Distillery"
        value={value.brand_name}
        onChange={(v) => set("brand_name", v)}
      />
      <TextField
        id="class_type"
        label="Class / type"
        placeholder="e.g. Bourbon Whiskey"
        value={value.class_type}
        onChange={(v) => set("class_type", v)}
      />
      <TextField
        id="alcohol_content"
        label="Alcohol content"
        placeholder="e.g. 40% ABV"
        value={value.alcohol_content}
        onChange={(v) => set("alcohol_content", v)}
      />
      <TextField
        id="net_contents"
        label="Net contents"
        placeholder="e.g. 750 mL"
        value={value.net_contents}
        onChange={(v) => set("net_contents", v)}
      />

      <label className="col-span-full mt-1 flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3">
        <input
          type="checkbox"
          checked={value.government_warning_required ?? true}
          onChange={(e) =>
            set("government_warning_required", e.target.checked)
          }
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">
            Government warning required
          </span>
          <span className="block text-slate-600">
            The 27 CFR §16.21 health warning must appear exactly as written on
            the label. Uncheck only if this product is exempt.
          </span>
        </span>
      </label>
    </fieldset>
  );
}

function TextField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
      />
    </div>
  );
}
