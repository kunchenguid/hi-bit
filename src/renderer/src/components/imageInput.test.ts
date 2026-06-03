import { describe, expect, it } from "vitest";
import { fitDimensions, imageDataUrl, imageFromClipboardEvent } from "./imageInput";

describe("fitDimensions", () => {
  it("leaves an image that already fits untouched", () => {
    expect(fitDimensions(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it("scales the longest edge down to the max, preserving aspect ratio", () => {
    expect(fitDimensions(2048, 1024, 1024)).toEqual({ width: 1024, height: 512 });
  });

  it("scales by height when the image is portrait", () => {
    expect(fitDimensions(1000, 2000, 1024)).toEqual({ width: 512, height: 1024 });
  });

  it("treats a zero-sized image as a no-op", () => {
    expect(fitDimensions(0, 0, 1024)).toEqual({ width: 0, height: 0 });
  });
});

describe("imageDataUrl", () => {
  it("builds a data URL from mime type and base64 bytes", () => {
    expect(imageDataUrl({ mimeType: "image/jpeg", data: "AAA" })).toBe(
      "data:image/jpeg;base64,AAA",
    );
  });
});

describe("imageFromClipboardEvent", () => {
  it("returns null when there is no clipboard data", () => {
    expect(imageFromClipboardEvent(null)).toBeNull();
  });

  it("returns the first image file from the clipboard items", () => {
    const file = new File(["x"], "p.png", { type: "image/png" });
    const clipboard = {
      items: [
        { kind: "string", type: "text/plain", getAsFile: () => null },
        { kind: "file", type: "image/png", getAsFile: () => file },
      ],
    } as unknown as DataTransfer;
    expect(imageFromClipboardEvent(clipboard)).toBe(file);
  });

  it("ignores non-image clipboard items", () => {
    const clipboard = {
      items: [{ kind: "file", type: "application/pdf", getAsFile: () => new File([], "d.pdf") }],
    } as unknown as DataTransfer;
    expect(imageFromClipboardEvent(clipboard)).toBeNull();
  });
});
