// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConfigStore } from "../state/configStore";
import { HarnessSetup } from "./HarnessSetup";

describe("HarnessSetup", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    useConfigStore.setState({
      config: { version: 2 },
      status: "ready",
      error: null,
      hasParentPin: false,
      setDefaultAgent: vi.fn(async (agent) => {
        useConfigStore.setState({ config: { version: 2, defaultAgent: agent } });
      }),
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    useConfigStore.setState({
      config: null,
      status: "idle",
      error: null,
      hasParentPin: false,
    });
  });

  it("saves the selected ACP agent without binary detection status", async () => {
    const onDone = vi.fn();

    await act(async () => {
      root.render(<HarnessSetup onDone={onDone} />);
    });

    expect(host.textContent).toContain("Pick an agent.");
    expect(host.textContent).not.toContain("Not on PATH");
    expect(host.textContent).not.toContain("Found:");

    const codexButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Codex"),
    );
    expect(codexButton).toBeDefined();

    await act(async () => {
      codexButton?.click();
    });

    expect(useConfigStore.getState().setDefaultAgent).toHaveBeenCalledWith("codex");
    expect(onDone).toHaveBeenCalled();
  });
});
