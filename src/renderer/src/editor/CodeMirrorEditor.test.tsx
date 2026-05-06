// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CodeMirrorEditor } from "./CodeMirrorEditor";

describe("CodeMirrorEditor cursor marker", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("hides the cursor helper label from editor accessibility text", async () => {
    await act(async () => {
      root.render(
        <CodeMirrorEditor
          filename="index.html"
          value="<h1>My Name</h1>"
          onChange={() => {}}
          ariaLabel="Code editor for index.html"
          cursorMarker={{ position: 4, key: 1 }}
        />,
      );
    });

    const marker = host.querySelector<HTMLElement>(".hb-editor-cursor-marker");

    expect(marker?.dataset.label).toBe("← Type here");
    expect(marker?.textContent).toBe("");
    expect(marker?.getAttribute("aria-hidden")).toBe("true");
  });
});
