// @vitest-environment jsdom

import type { UpdateStatus } from "@shared/ipc";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPDATE_STATUS_REFRESH_INTERVAL_MS, useUpdateStatus } from "./useUpdateStatus";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

function Probe() {
  const status = useUpdateStatus();
  return (
    <span data-latest={status?.latestVersion ?? "none"}>{String(status?.updateAvailable)}</span>
  );
}

function stubApp(getUpdateStatus: () => Promise<UpdateStatus>) {
  (window as unknown as { hibit?: unknown }).hibit = { app: { getUpdateStatus } };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useUpdateStatus", () => {
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
    vi.useRealTimers();
    (window as unknown as { hibit?: unknown }).hibit = undefined;
  });

  it("reads the cached status on mount", async () => {
    const status: UpdateStatus = {
      currentVersion: "0.0.2",
      latestVersion: "0.0.3",
      updateAvailable: true,
      releaseUrl: "https://example.test/rel",
    };
    const getUpdateStatus = vi.fn(async () => status);
    stubApp(getUpdateStatus);

    act(() => root.render(<Probe />));
    await flush();

    expect(getUpdateStatus).toHaveBeenCalledOnce();
    expect(host.querySelector("span")?.getAttribute("data-latest")).toBe("0.0.3");
    expect(host.querySelector("span")?.textContent).toBe("true");
  });

  it("refreshes on the slow interval while mounted", async () => {
    vi.useFakeTimers();
    const getUpdateStatus = vi
      .fn<() => Promise<UpdateStatus>>()
      .mockResolvedValueOnce({
        currentVersion: "0.0.2",
        latestVersion: "0.0.2",
        updateAvailable: false,
        releaseUrl: null,
      })
      .mockResolvedValueOnce({
        currentVersion: "0.0.2",
        latestVersion: "0.0.3",
        updateAvailable: true,
        releaseUrl: "https://example.test/rel",
      });
    stubApp(getUpdateStatus);

    act(() => root.render(<Probe />));
    await act(async () => {
      await Promise.resolve();
    });
    expect(getUpdateStatus).toHaveBeenCalledOnce();
    expect(host.querySelector("span")?.textContent).toBe("false");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_STATUS_REFRESH_INTERVAL_MS);
    });

    expect(getUpdateStatus).toHaveBeenCalledTimes(2);
    expect(host.querySelector("span")?.textContent).toBe("true");
  });

  it("stays null and never throws when the bridge is unavailable", async () => {
    (window as unknown as { hibit?: unknown }).hibit = undefined;

    act(() => root.render(<Probe />));
    await flush();

    expect(host.querySelector("span")?.textContent).toBe("undefined");
    expect(host.querySelector("span")?.getAttribute("data-latest")).toBe("none");
  });

  it("swallows a failed check and leaves the status null", async () => {
    const getUpdateStatus = vi.fn(async () => {
      throw new Error("offline");
    });
    stubApp(getUpdateStatus as unknown as () => Promise<UpdateStatus>);

    act(() => root.render(<Probe />));
    await flush();

    expect(getUpdateStatus).toHaveBeenCalledOnce();
    expect(host.querySelector("span")?.textContent).toBe("undefined");
  });
});
