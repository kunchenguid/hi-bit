import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function ruleBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("app.css", () => {
  it("pins the composer by bounding the workspace and scrolling only the messages", () => {
    const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");

    // The workspace fills the viewport exactly and never lets the page scroll,
    const workspace = ruleBlock(css, ".hb-workspace");
    expect(workspace).toMatch(/(?<!min-)height:\s*100vh;/);
    expect(workspace).toMatch(/overflow:\s*hidden;/);

    // the single-column layout constrains the chat card to that height,
    const layout = ruleBlock(css, ".hb-chat-layout");
    expect(layout).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\);/);

    // the card clips its own overflow so its rows stay put,
    expect(ruleBlock(css, ".hb-chat-card")).toMatch(/overflow:\s*hidden;/);

    // and only the message list scrolls.
    expect(ruleBlock(css, ".hb-message-list")).toMatch(/overflow:\s*auto;/);
  });

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

  it("keeps the voice callout inside the mobile viewport", () => {
    const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");
    const mobileRuleIndex = css.lastIndexOf("@media (max-width: 520px)");
    const mobileRules = css.slice(mobileRuleIndex).match(/^@media \(max-width: 520px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    const voiceCalloutIndex = css.indexOf(".hb-voice-callout {");

    expect(ruleBlock(css, ".hb-composer")).toMatch(/position:\s*relative;/);
    expect(mobileRuleIndex).toBeGreaterThan(voiceCalloutIndex);
    expect(mobileRules).toMatch(/\.hb-voice\s*\{[^}]*position:\s*static;/);
    expect(mobileRules).toMatch(/\.hb-voice-callout\s*\{/);
    expect(mobileRules).toMatch(/position:\s*absolute;/);
    expect(mobileRules).toMatch(/left:\s*var\(--s-1\);/);
    expect(mobileRules).toMatch(/right:\s*var\(--s-1\);/);
    expect(mobileRules).toMatch(/width:\s*auto;/);
  });
});
