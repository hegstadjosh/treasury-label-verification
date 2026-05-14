export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg"];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const CLIENT_REQUEST_BYTE_BUDGET = 4 * 1024 * 1024;

interface FileLike {
  name: string;
  type: string;
  size: number;
}

export function validateImageFile(file: FileLike): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Only PNG or JPG images are supported.";
  }
  if (file.size <= 0) {
    return "Image file is empty.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Image exceeds the ${formatBytes(MAX_IMAGE_BYTES)} per-file limit.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
