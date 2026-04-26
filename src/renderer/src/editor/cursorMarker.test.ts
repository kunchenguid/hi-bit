import { describe, expect, it } from "vitest";
import {
  BIT_CURSOR_MARKER,
  findCursorMarkerPosition,
  findLocalCursorMarkerPosition,
  parseCursorMarkerResponse,
} from "./cursorMarker";

describe("parseCursorMarkerResponse", () => {
  it("returns the marked surrounding content from strict JSON", () => {
    const parsed = parseCursorMarkerResponse(
      JSON.stringify({ surrounding_content_with_marker: `<main>${BIT_CURSOR_MARKER}</main>` }),
    );

    expect(parsed).toEqual({
      ok: true,
      surroundingContentWithMarker: `<main>${BIT_CURSOR_MARKER}</main>`,
    });
  });

  it("rejects JSON without exactly one marker", () => {
    const parsed = parseCursorMarkerResponse(
      JSON.stringify({ surrounding_content_with_marker: "<main></main>" }),
    );

    expect(parsed).toEqual({ ok: false, error: "Bit did not return a cursor marker." });
  });
});

describe("findCursorMarkerPosition", () => {
  it("returns the absolute position of the marker inside the matching excerpt", () => {
    const content = "<body>\n  <h1>Hello</h1>\n</body>";
    const result = findCursorMarkerPosition(
      content,
      `<body>\n  ${BIT_CURSOR_MARKER}<h1>Hello</h1>\n</body>`,
    );

    expect(result).toEqual({ ok: true, position: "<body>\n  ".length });
  });

  it("rejects an excerpt that matches more than one place", () => {
    const content = "<li></li>\n<li></li>";
    const result = findCursorMarkerPosition(content, `<li>${BIT_CURSOR_MARKER}</li>`);

    expect(result).toEqual({ ok: false, error: "Bit found more than one matching spot." });
  });
});

describe("findLocalCursorMarkerPosition", () => {
  it("uses Bit's line hint when the helper request fails", () => {
    const content = [
      "<!doctype html>",
      "<html>",
      "  <body>",
      "    <h1>Hello!</h1>",
      "    <p>Change me.</p>",
      "  </body>",
      "</html>",
    ].join("\n");

    const result = findLocalCursorMarkerPosition(
      content,
      "Replace line 5 (the paragraph) with this: `<button>Roll</button>`",
    );

    expect(result).toEqual({ ok: true, position: content.indexOf("    <p>Change me.</p>") });
  });

  it("falls back to the first paragraph when Bit describes replacing the paragraph", () => {
    const content = "<body>\n  <h1>Hello!</h1>\n  <p>Change me.</p>\n</body>";
    const result = findLocalCursorMarkerPosition(
      content,
      "Replace the paragraph with a button that says Roll the dice.",
    );

    expect(result).toEqual({ ok: true, position: content.indexOf("  <p>") });
  });
});
