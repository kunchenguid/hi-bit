// @vitest-environment jsdom
/// <reference types="node" />

import type { AuthStatus } from "@shared/auth";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReconnectOverlay } from "./ReconnectOverlay";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const authStatus: AuthStatus = {
  authenticated: false,
  storage: { path: "/tmp/codex.json", encrypted: true },
};

describe("ReconnectOverlay", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("blocks with a modal dialog and a reconnect action", () => {
    const onReconnect = vi.fn();
    act(() =>
      root.render(
        <ReconnectOverlay
          status={authStatus}
          busy={false}
          error={null}
          onReconnect={onReconnect}
        />,
      ),
    );

    const dialog = host.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog).not.toBeNull();
    const button = host.querySelector("button");
    expect(button?.textContent).toContain("Reconnect Codex");

    act(() => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it("disables the action and shows progress while reconnecting", () => {
    act(() =>
      root.render(
        <ReconnectOverlay status={authStatus} busy={true} error={null} onReconnect={vi.fn()} />,
      ),
    );

    const button = host.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain("Waiting for Codex");
  });

  it("surfaces a reconnect error", () => {
    act(() =>
      root.render(
        <ReconnectOverlay
          status={authStatus}
          busy={false}
          error="Codex token refresh failed with HTTP 401"
          onReconnect={vi.fn()}
        />,
      ),
    );

    expect(host.querySelector(".hb-error")?.textContent).toContain("HTTP 401");
  });
});
