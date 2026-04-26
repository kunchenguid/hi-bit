import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const parentHomeSource = resolve(__dirname, "../../renderer/src/screens/ParentHome.tsx");

// The "Switch profile" button on the ParentHome header is the only in-session
// affordance to return to the profile picker. This test pins it so the button
// cannot silently disappear.
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
});
