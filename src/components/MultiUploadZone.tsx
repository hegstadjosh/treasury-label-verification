"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ACCEPTED = ["image/png", "image/jpeg"];

export interface UploadedFile {
  /** Stable client id used for keying + remove. */
  id: string;
  file: File;
}

let nextId = 0;
function makeId(file: File): string {
  nextId += 1;
  return `${nextId}-${file.name}`;
}

export function MultiUploadZone({
  files,
  onFilesChange,
  disabled,
}: {
  files: UploadedFile[];
  onFilesChange: (next: UploadedFile[]) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const acceptFiles = useCallback(
    (incoming: FileList | File[] | null) => {
      setError(null);
      if (!incoming) return;
      const arr = Array.from(incoming);
      const rejected: string[] = [];
      const accepted: UploadedFile[] = [];
      for (const f of arr) {
        if (!ACCEPTED.includes(f.type)) {
          rejected.push(f.name);
          continue;
        }
        accepted.push({ id: makeId(f), file: f });
      }
      if (accepted.length > 0) {
        onFilesChange([...files, ...accepted]);
      }
      if (rejected.length > 0) {
        setError(
          rejected.length === 1
            ? `Skipped "${rejected[0]}" — only PNG or JPG images are supported.`
            : `Skipped ${rejected.length} non-image files. Only PNG or JPG are supported.`,
        );
      }
    },
    [files, onFilesChange],
  );

  function removeAt(id: string) {
    onFilesChange(files.filter((f) => f.id !== id));
  }

  function clearAll() {
    onFilesChange([]);
  }

  return (
    <div>
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
          acceptFiles(e.dataTransfer.files);
        }}
        className={`flex min-h-[10rem] flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
        } ${disabled ? "opacity-60" : ""}`}
      >
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-slate-700">
            Drag and drop one or more label images, or
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Choose files
          </button>
          <p className="text-xs text-slate-500">
            PNG or JPG. Multiple files allowed.
          </p>
        </div>
        <input
          ref={inputRef}
          id="label-images"
          type="file"
          accept="image/png,image/jpeg"
          multiple
          className="hidden"
          onChange={(e) => {
            acceptFiles(e.target.files);
            // Reset so the same filename can be re-selected later if removed.
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">
              {files.length} file{files.length === 1 ? "" : "s"} ready
            </p>
            <button
              type="button"
              onClick={clearAll}
              disabled={disabled}
              className="text-xs font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50"
            >
              Clear all
            </button>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {files.map((f) => (
              <FileThumb
                key={f.id}
                upload={f}
                onRemove={() => removeAt(f.id)}
                disabled={disabled}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function FileThumb({
  upload,
  onRemove,
  disabled,
}: {
  upload: UploadedFile;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const url = useMemo(
    () => URL.createObjectURL(upload.file),
    [upload.file],
  );
  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <li className="group relative overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={upload.file.name}
        className="aspect-[4/3] w-full object-contain bg-slate-50"
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
        ×
      </button>
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
