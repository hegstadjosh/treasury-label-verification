"use client";

import { useEffect, useMemo } from "react";
import { formatBytes } from "@/lib/upload-validation";
import type { UploadedFile } from "./uploadTypes";

export function FileThumb({
  upload,
  onRemove,
  disabled,
}: {
  upload: UploadedFile;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const url = useMemo(() => URL.createObjectURL(upload.file), [upload.file]);

  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <li className="group relative overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={upload.file.name}
        className="aspect-[4/3] w-full bg-slate-50 object-contain"
      />
      <div className="border-t border-slate-200 px-2 py-1.5">
        <p
          className="truncate text-xs font-medium text-slate-800"
          title={upload.file.name}
        >
          {upload.file.name}
        </p>
        <p className="text-[10px] text-slate-500">
          {formatBytes(upload.file.size)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`Remove ${upload.file.name}`}
        className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-xs font-semibold text-slate-700 shadow ring-1 ring-slate-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
      >
        x
      </button>
    </li>
  );
}
