"use client";

import { useEffect, useState } from "react";

export function useImageDataUrl(file: File | null): string | null {
  const [preview, setPreview] = useState<{
    file: File;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled && typeof reader.result === "string") {
        setPreview({ file, url: reader.result });
      }
    };
    reader.onerror = () => {
      if (!cancelled) setPreview(null);
    };
    reader.readAsDataURL(file);

    return () => {
      cancelled = true;
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);

  return preview?.file === file ? preview.url : null;
}
