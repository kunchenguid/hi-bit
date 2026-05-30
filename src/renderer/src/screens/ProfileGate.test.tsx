// @vitest-environment jsdom
/// <reference types="node" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileGate } from "./ProfileGate";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

describe("ProfileGate", () => {
  let host: HTMLDivElement;
  let root: Root;
  let styles: HTMLStyleElement;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    styles = document.createElement("style");
    styles.textContent = readFileSync(
      resolve(process.cwd(), "src/renderer/src/styles/app.css"),
      "utf8",
    );
    document.head.append(styles);
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    styles.remove();
    vi.restoreAllMocks();
  });

  it("keeps the intro copy readable without a Codex sign-out action", async () => {
    await act(async () => {
      root.render(
        <ProfileGate
          busy={false}
          error={null}
          profiles={[adaProfile()]}
          onCreate={vi.fn(async () => {})}
          onSelect={vi.fn(async () => {})}
        />,
      );
    });

    const intro = host.querySelector<HTMLElement>(".hb-profile-gate-copy");

    expect(intro).not.toBeNull();
    expect(getComputedStyle(intro as HTMLElement).minWidth).toBe("0px");
    expect(host.textContent).not.toContain("Log out");
  });
});

function adaProfile() {
  return {
    schemaVersion: 1 as const,
    id: "ada",
    name: "Ada",
    age: 9,
    interests: ["space"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    unlockedConcepts: [],
    unlockStats: { buildsDelegated: 0, openedActivities: false },
  };
}
