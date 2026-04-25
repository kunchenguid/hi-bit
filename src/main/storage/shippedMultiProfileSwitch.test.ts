import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const parentHomeSource = resolve(__dirname, "../../renderer/src/screens/ParentHome.tsx");
const v1Gaps = resolve(__dirname, "../../../V1_GAPS.md");

// V1_GAPS.md flagged "Multi-profile UX polish" as worth-flagging because there
// was no in-session affordance to switch profiles: from kid mode you'd need to
// unlock parent mode then lock back, and ParentHome itself offered no path to
// the profile picker either. iter-26 closes this by adding a "Switch profile"
// button to the ParentHome header that calls selectProfile(null), so App.tsx
// routes back to ProfileGate. This test pins the closure so the button cannot
// silently disappear.
describe("shipped multi-profile switch affordance", () => {
  it("ParentHome.tsx renders a Switch profile button wired to selectProfile(null)", async () => {
    const text = await readFile(parentHomeSource, "utf8");
    expect(text).toMatch(/Switch profile/);
    expect(text).toMatch(/selectProfile/);
    expect(text).toMatch(/selectProfile\(null\)/);
    expect(text).toMatch(/useProfileStore/);
  });

  it("Switch profile button lives in the parent header next to Lock parent mode", async () => {
    const text = await readFile(parentHomeSource, "utf8");
    const headerStart = text.indexOf("hb-parent-header");
    expect(headerStart).toBeGreaterThan(-1);
    const headerEnd = text.indexOf("</header>", headerStart);
    expect(headerEnd).toBeGreaterThan(headerStart);
    const header = text.slice(headerStart, headerEnd);
    expect(header).toMatch(/Switch profile/);
    expect(header).toMatch(/Lock parent mode/);
  });

  it("V1_GAPS.md no longer lists multi-profile UX as an open flag", async () => {
    const text = await readFile(v1Gaps, "utf8");
    expect(text).toMatch(/closed iter-26/i);
    // The old "no in-session profile-switch affordance" phrasing must not
    // reappear verbatim as an open gap once closed.
    const flaggedBlock = text.slice(text.indexOf("Not blockers, but worth flagging"));
    expect(flaggedBlock).not.toMatch(/no in-session profile-switch affordance from kid mode/i);
  });
});
