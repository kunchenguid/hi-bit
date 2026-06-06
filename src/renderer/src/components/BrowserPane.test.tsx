// @vitest-environment jsdom

import type { BrowserState } from "@shared/browser";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserPane } from "./BrowserPane";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe("BrowserPane", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("does not allow iframe popups", async () => {
    await renderBrowserPane(root, host, {
      tabs: [{ id: "web", url: "https://wikipedia.org/", kind: "web" }],
      activeTabId: "web",
    });

    expect(host.querySelector("iframe")?.getAttribute("sandbox")).not.toContain("allow-popups");
  });
});

async function renderBrowserPane(root: Root, _host: HTMLElement, state: BrowserState) {
  await act(async () => {
    root.render(
      <BrowserPane
        state={state}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onReportLoaded={vi.fn()}
        onOpenExternal={vi.fn()}
      />,
    );
  });
}
