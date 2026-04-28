import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../renderer/src/styles/app.css", import.meta.url)),
  "utf8",
);

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

describe("renderer chat styles", () => {
  it("keeps kid bubble max-width relative to the chat pane", () => {
    const row = ruleFor(".hb-chat-row-kid");

    expect(row).toContain("align-self: stretch;");
    expect(row).toContain("justify-content: flex-end;");
  });
});
