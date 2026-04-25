import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const technicalDesign = resolve(__dirname, "../../../TECHNICAL_DESIGN.md");
const v1Gaps = resolve(__dirname, "../../../V1_GAPS.md");

// V1_GAPS.md flagged "Parent-mode pin default" as an unresolved design
// ambiguity: fresh installs don't require a PIN, so whoever taps Parent mode
// first sets it. iter-23 closed that gap by documenting the trust-based lazy
// PIN lifecycle in TECHNICAL_DESIGN.md §Resolved. This test pins the closure
// so the gap cannot silently reopen.
describe("shipped Parent-mode PIN lifecycle docs", () => {
  it("TECHNICAL_DESIGN.md §Resolved documents the lazy PIN setup design", async () => {
    const text = await readFile(technicalDesign, "utf8");
    const resolvedIndex = text.indexOf("Resolved:");
    expect(resolvedIndex).toBeGreaterThan(-1);
    const resolvedBlock = text.slice(resolvedIndex);
    expect(resolvedBlock).toMatch(/Parent-mode PIN lifecycle/i);
    expect(resolvedBlock).toMatch(/trust-based/i);
    expect(resolvedBlock).toMatch(/ParentGate\.tsx/);
    expect(resolvedBlock).toMatch(/parentPin\.ts/);
    expect(resolvedBlock).toMatch(/config\.json/);
  });

  it("V1_GAPS.md no longer lists Parent-mode pin default as an open flag", async () => {
    const text = await readFile(v1Gaps, "utf8");
    expect(text).not.toMatch(/### Parent-mode pin default/i);
  });

  it("V1_GAPS.md no longer lists System prompt coverage audit as an open flag", async () => {
    // iter-7 closed this via src/main/storage/shippedPrompt.test.ts; the gap
    // doc had stale text calling for a read-through that is already done.
    const text = await readFile(v1Gaps, "utf8");
    expect(text).not.toMatch(/### System prompt coverage audit/i);
  });
});
