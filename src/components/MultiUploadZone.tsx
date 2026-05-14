"use client";

import { useCallback, useRef, useState } from "react";
import {
  ACCEPTED_IMAGE_TYPES,
  formatBytes,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from "@/lib/upload-validation";
import { FileThumb } from "./FileThumb";
import type { UploadedFile } from "./uploadTypes";

export type { UploadedFile } from "./uploadTypes";

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
        const validationError = validateImageFile(f);
        if (validationError) {
          rejected.push(`${f.name}: ${validationError}`);
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
            ? `Skipped ${rejected[0]}`
            : `Skipped ${rejected.length} files. ${rejected.slice(0, 2).join(" ")}`,
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
            PNG or JPG, up to {formatBytes(MAX_IMAGE_BYTES)} each.
          </p>
        </div>
        <input
          ref={inputRef}
          id="label-images"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
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
