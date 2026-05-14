"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ACCEPTED = ["image/png", "image/jpeg"];

export function UploadZone({
  file,
  onFileChange,
  disabled,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback(
    (incoming: File | null) => {
      setError(null);
      if (!incoming) {
        onFileChange(null);
        return;
      }
      if (!ACCEPTED.includes(incoming.type)) {
        setError("Only PNG or JPG images are supported.");
        return;
      }
      onFileChange(incoming);
    },
    [onFileChange],
  );

  return (
    <div>
      <label
        htmlFor="label-image"
        className="block text-sm font-medium text-slate-700"
      >
        Label image
      </label>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragging(false);
          const dropped = e.dataTransfer.files?.[0] ?? null;
          acceptFile(dropped);
        }}
        className={`mt-2 flex min-h-[12rem] flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-slate-300 bg-white"
        } ${disabled ? "opacity-60" : ""}`}
      >
        {previewUrl ? (
          <div className="flex w-full flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={file?.name ?? "Selected label preview"}
              className="max-h-72 w-auto max-w-full rounded border border-slate-200 bg-white object-contain shadow-sm"
            />
            <div className="text-xs text-slate-600">
              <span className="font-medium">{file?.name}</span>
              {file ? ` — ${formatBytes(file.size)}` : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => acceptFile(null)}
                disabled={disabled}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-slate-700">
              Drag and drop a label image here, or
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Choose a file
            </button>
            <p className="text-xs text-slate-500">PNG or JPG, up to ~10 MB.</p>
          </div>
        )}
        <input
          ref={inputRef}
          id="label-image"
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
