"use client";

import { useEffect, useState } from "react";
import { useImageDataUrl } from "@/hooks/useImageDataUrl";
import type { BatchLabelEntry, SourceBox } from "@/lib/types";
import { ResultPanel } from "./ResultPanel";

const BOX_LABELS = {
  brand_name: "Brand",
  class_type: "Class",
  alcohol_content: "ABV",
  net_contents: "Net",
  government_warning: "Warning",
} as const;

export function LabelDrillDown({
  entry,
  imageFile,
  sourceBoxes,
  onClose,
}: {
  entry: BatchLabelEntry | null;
  imageFile: File | null;
  sourceBoxes?: SourceBox[];
  onClose: () => void;
}) {
  const open = entry !== null;
  const imageUrl = useImageDataUrl(imageFile);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !entry) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${entry.filename}`}
      className="fixed inset-0 z-50 flex"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />

      {/* Panel — full-screen on mobile, right-side sheet on desktop. */}
      <aside className="relative ml-auto flex h-full w-full flex-col bg-slate-50 shadow-xl sm:max-w-3xl">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Review label
            </p>
            <h2
              className="truncate text-base font-semibold text-slate-900"
              title={entry.filename}
            >
              {entry.filename}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to queue
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <LabelImagePreview
            imageUrl={imageUrl}
            filename={entry.filename}
            sourceBoxes={sourceBoxes ?? []}
          />
          <ResultPanel result={entry.result} />
        </div>
      </aside>
    </div>
  );
}

function LabelImagePreview({
  imageUrl,
  filename,
  sourceBoxes,
}: {
  imageUrl: string | null;
  filename: string;
  sourceBoxes: SourceBox[];
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const canPreview = imageUrl && failedUrl !== imageUrl;

  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          Label image
        </h3>
      </div>
      <div className="bg-slate-100 p-3">
        {canPreview ? (
          <div className="flex justify-center">
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={`Uploaded label ${filename}`}
                onError={() => setFailedUrl(imageUrl)}
                className="block max-h-[24rem] max-w-full rounded border border-slate-200 bg-white"
              />
              {sourceBoxes.map((box, index) => (
                <SourceBoxOverlay key={`${box.field}-${index}`} box={box} />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            Image preview is not available for this result.
          </div>
        )}
      </div>
      {sourceBoxes.length > 0 ? (
        <p className="border-t border-slate-200 px-5 py-2 text-xs text-slate-500">
          Red boxes show where the AI found each extracted field.
        </p>
      ) : null}
    </section>
  );
}

function SourceBoxOverlay({ box }: { box: SourceBox }) {
  const [yMin, xMin, yMax, xMax] = box.box_2d;

  return (
    <div
      className="pointer-events-none absolute rounded-sm border-2 border-red-500 bg-red-500/10"
      style={{
        top: `${yMin / 10}%`,
        left: `${xMin / 10}%`,
        height: `${(yMax - yMin) / 10}%`,
        width: `${(xMax - xMin) / 10}%`,
      }}
      title={box.label ?? BOX_LABELS[box.field]}
    >
      <span className="absolute -top-5 left-0 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
        {box.label || BOX_LABELS[box.field]}
      </span>
    </div>
  );
}
