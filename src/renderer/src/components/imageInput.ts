import type { OutgoingImage } from "@shared/chat";

/** Longest edge we downscale an attached picture to before sending, in pixels. */
export const MAX_IMAGE_DIM = 1024;
const JPEG_QUALITY = 0.8;

/** A displayable `data:` URL for an attachment carrying base64 bytes. */
export function imageDataUrl(image: { mimeType: string; data: string }): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

/**
 * Scales `(width, height)` so its longest edge is at most `max`, never enlarging.
 * Pure so the sizing rule can be unit-tested without a canvas.
 */
export function fitDimensions(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest === 0) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Turns a picked/pasted/captured image blob into a downscaled JPEG attachment
 * (base64, no `data:` prefix). Flattens transparency onto white so a PNG with an
 * alpha channel doesn't come out black as JPEG. Kept small to keep model cost and
 * the on-disk attachment sane.
 */
export async function toAttachment(source: Blob): Promise<OutgoingImage> {
  const bitmap = await createImageBitmap(source);
  try {
    const { width, height } = fitDimensions(bitmap.width, bitmap.height, MAX_IMAGE_DIM);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read that picture.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { mimeType: "image/jpeg", data: dataUrl.split(",")[1] ?? "" };
  } finally {
    bitmap.close();
  }
}

/**
 * Reads an image off the system clipboard, if one is there. Returns null when the
 * clipboard has no picture or the browser denies access - the caller can fall
 * back to plain ⌘V into the text box.
 */
export async function readClipboardImage(): Promise<Blob | null> {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith("image/"));
      if (type) return await item.getType(type);
    }
  } catch {
    // No permission or no clipboard image - caller falls back to ⌘V.
  }
  return null;
}

/** Pulls the first image blob out of a paste event's clipboard items, if any. */
export function imageFromClipboardEvent(clipboardData: DataTransfer | null): Blob | null {
  if (!clipboardData) return null;
  for (const item of clipboardData.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
