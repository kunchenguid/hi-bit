import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("app.css", () => {
  it("keeps the profile settings popover within the mobile viewport", () => {
    const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");
    const mobileRules = css.match(/@media \(max-width: 920px\) \{[\s\S]*\n\}/)?.[0] ?? "";

    expect(mobileRules).toMatch(/\.hb-profile-settings-popover\s*\{/);
    expect(mobileRules).toMatch(/\.hb-header-actions\s*\{[^}]*width:\s*100%;/);
    expect(mobileRules).toMatch(/\.hb-profile-settings-menu\s*\{[^}]*width:\s*100%;/);
    expect(mobileRules).toMatch(/left:\s*0;/);
    expect(mobileRules).toMatch(/right:\s*auto;/);
    expect(mobileRules).toMatch(/\.hb-profile-settings-popover\s*\{[^}]*width:\s*100%;/);
  });
});
