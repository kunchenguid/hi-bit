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

  it("bounds Settings and scrolls only the content panel", () => {
    const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");

    const settings = ruleBlock(css, ".hb-settings");
    expect(settings).toMatch(/grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
    expect(settings).toMatch(/overflow:\s*hidden;/);
    expect(settings).toMatch(/max-height:\s*calc\(100vh - var\(--s-6\)\);/);

    const layout = ruleBlock(css, ".hb-settings-layout");
    expect(layout).toMatch(/grid-template-columns:\s*230px minmax\(0,\s*1fr\);/);
    expect(layout).toMatch(/min-height:\s*0;/);
    expect(layout).toMatch(/overflow:\s*hidden;/);

    const content = ruleBlock(css, ".hb-settings-content");
    expect(content).toMatch(/min-height:\s*0;/);
    expect(content).toMatch(/overflow-y:\s*auto;/);

    const mobileRuleIndex = css.indexOf("@media (max-width: 680px)");
    const mobileRules = css.slice(mobileRuleIndex);
    expect(mobileRules).toMatch(/\.hb-settings-layout\s*\{[^}]*grid-template-columns:\s*1fr;/);
    expect(mobileRules).toMatch(/\.hb-settings-sidebar\s*\{[^}]*flex-direction:\s*row;/);
    expect(mobileRules).toMatch(/\.hb-settings-sidebar\s*\{[^}]*overflow-x:\s*auto;/);
    expect(mobileRules).toMatch(/\.hb-settings-content\s*\{[^}]*padding:\s*var\(--s-2\);/);
  });

  it("keeps the voice callout inside the mobile viewport", () => {
    const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");
    const mobileRuleIndex = css.lastIndexOf("@media (max-width: 520px)");
    const mobileRules =
      css.slice(mobileRuleIndex).match(/^@media \(max-width: 520px\) \{[\s\S]*?\n\}/)?.[0] ?? "";
    const voiceCalloutIndex = css.indexOf(".hb-voice-callout {");

    expect(mobileRuleIndex).toBeGreaterThan(voiceCalloutIndex);
    expect(ruleBlock(css, ".hb-voice")).toMatch(/position:\s*relative;/);
    expect(mobileRules).not.toMatch(/\.hb-voice\s*\{[^}]*position:\s*static;/);
    expect(mobileRules).toMatch(/\.hb-voice-callout\s*\{/);
    expect(mobileRules).toMatch(/position:\s*absolute;/);
    expect(mobileRules).toMatch(/left:\s*50%;/);
    expect(mobileRules).toMatch(/right:\s*auto;/);
    expect(mobileRules).toMatch(/width:\s*min\(220px,\s*calc\(100vw - var\(--s-3\)\)\);/);
    expect(mobileRules).toMatch(/transform:\s*translateX\(-50%\);/);
    expect(mobileRules).toMatch(/\.hb-voice-callout::after\s*\{/);
    expect(mobileRules).toMatch(/transform:\s*translateX\(-50%\) rotate\(45deg\);/);
  });
});
