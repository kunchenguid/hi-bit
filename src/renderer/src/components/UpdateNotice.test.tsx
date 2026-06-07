// @vitest-environment jsdom

import type { UpdateStatus } from "@shared/ipc";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPGRADE_COMMAND, UpdateNotice } from "./UpdateNotice";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const updateAvailable: UpdateStatus = {
  currentVersion: "0.0.2",
  latestVersion: "0.0.3",
  updateAvailable: true,
  releaseUrl: "https://github.com/kunchenguid/hi-bit/releases/tag/v0.0.3",
};

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("UpdateNotice", () => {
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
    (window as unknown as { hibit?: unknown }).hibit = undefined;
  });

  it("renders nothing when no update is available", () => {
    act(() =>
      root.render(
        <UpdateNotice
          status={{
            currentVersion: "0.0.3",
            latestVersion: "0.0.3",
            updateAvailable: false,
            releaseUrl: null,
          }}
        />,
      ),
    );

    expect(host.querySelector('[aria-label="update available"]')).toBeNull();
  });

  it("shows the homebrew upgrade command and the version jump", () => {
    act(() => root.render(<UpdateNotice status={updateAvailable} />));

    expect(host.textContent).toContain(UPGRADE_COMMAND);
    expect(UPGRADE_COMMAND).toBe("brew update && brew upgrade --cask hi-bit");
    expect(host.textContent).toContain("v0.0.3");
    expect(host.textContent).toContain("0.0.2");
  });

  it("copies the upgrade command to the clipboard", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    act(() => root.render(<UpdateNotice status={updateAvailable} />));
    const copyButton = host.querySelector<HTMLButtonElement>('[aria-label="copy update command"]');
    act(() => copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();

    expect(writeText).toHaveBeenCalledWith(UPGRADE_COMMAND);
    expect(copyButton?.textContent).toBe("Copied");
  });

  it("does not show copied when clipboard writing is unavailable", async () => {
    Object.assign(navigator, { clipboard: undefined });

    act(() => root.render(<UpdateNotice status={updateAvailable} />));
    const copyButton = host.querySelector<HTMLButtonElement>('[aria-label="copy update command"]');
    act(() => copyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();

    expect(copyButton?.textContent).toBe("Copy");
  });

  it("opens the release notes page through the bridge", () => {
    const openReleasePage = vi.fn(async () => {});
    (window as unknown as { hibit: unknown }).hibit = { app: { openReleasePage } };

    act(() => root.render(<UpdateNotice status={updateAvailable} />));
    const releaseButton = [...host.querySelectorAll("button")].find((button) =>
      /release notes/i.test(button.textContent ?? ""),
    );
    act(() => releaseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(openReleasePage).toHaveBeenCalledOnce();
  });
});
