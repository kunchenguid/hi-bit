// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KidShell } from "./KidShell";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function getButton(label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll("button"));
  const match = buttons.find((b) => (b.textContent ?? "").includes(label));
  if (!match) throw new Error(`Button not found: ${label}`);
  return match;
}

describe("KidShell", () => {
  it("renders the Bit home button and tab buttons", () => {
    act(() => {
      root.render(
        <KidShell current="home" onNavigate={() => {}} onEnterParentMode={() => {}}>
          <div>kid content</div>
        </KidShell>,
      );
    });
    expect(container.textContent).toContain("Bit");
    expect(container.textContent).toContain("Switch dream");
    expect(container.textContent).toContain("My projects");
    expect(container.textContent).toContain("For grown-ups");
    expect(container.textContent).toContain("kid content");
  });

  it("marks the current tab as pressed", () => {
    act(() => {
      root.render(
        <KidShell current="picker" onNavigate={() => {}} onEnterParentMode={() => {}}>
          <div />
        </KidShell>,
      );
    });
    expect(getButton("Switch dream").getAttribute("aria-pressed")).toBe("true");
    expect(getButton("My projects").getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onNavigate with the right view", () => {
    const onNavigate = vi.fn();
    act(() => {
      root.render(
        <KidShell current="home" onNavigate={onNavigate} onEnterParentMode={() => {}}>
          <div />
        </KidShell>,
      );
    });
    act(() => getButton("Switch dream").click());
    act(() => getButton("My projects").click());
    expect(onNavigate).toHaveBeenNthCalledWith(1, "picker");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "projects");
  });

  it("calls onEnterParentMode when For grown-ups is clicked", () => {
    const onEnterParentMode = vi.fn();
    act(() => {
      root.render(
        <KidShell current="home" onNavigate={() => {}} onEnterParentMode={onEnterParentMode}>
          <div />
        </KidShell>,
      );
    });
    act(() => getButton("For grown-ups").click());
    expect(onEnterParentMode).toHaveBeenCalledTimes(1);
  });

  it("returns home when the Bit button is clicked", () => {
    const onNavigate = vi.fn();
    act(() => {
      root.render(
        <KidShell current="picker" onNavigate={onNavigate} onEnterParentMode={() => {}}>
          <div />
        </KidShell>,
      );
    });
    act(() => getButton("Bit").click());
    expect(onNavigate).toHaveBeenCalledWith("home");
  });
});
