import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app.css", () => {
  it("keeps the profile settings popover within the mobile viewport", () => {
    const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");
    const mobileRules = css.match(/@media \(max-width: 920px\) \{[\s\S]*\n\}/)?.[0] ?? "";

    expect(mobileRules).toMatch(/\.hb-profile-settings-popover\s*\{/);
    expect(mobileRules).toMatch(/left:\s*0;/);
    expect(mobileRules).toMatch(/right:\s*auto;/);
    expect(mobileRules).toMatch(/width:\s*calc\(100vw - var\(--s-4\)\);/);
  });
});
