import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appCssPath = resolve(__dirname, "..", "renderer", "src", "styles", "app.css");

async function loadCss(): Promise<string> {
  return readFile(appCssPath, "utf8");
}

function extractReducedMotionBlock(css: string): string | null {
  const marker = "@media (prefers-reduced-motion: reduce)";
  const start = css.indexOf(marker);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  if (open === -1) return null;
  let depth = 1;
  let i = open + 1;
  while (i < css.length && depth > 0) {
    const ch = css[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return depth === 0 ? css.slice(open + 1, i - 1) : null;
}

function extractRuleBlock(css: string, selectorStart: string): string | null {
  const start = css.indexOf(selectorStart);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  if (open === -1) return null;
  const close = css.indexOf("}", open);
  if (close === -1) return null;
  return css.slice(open + 1, close);
}

describe("reduced-motion media query in renderer app.css", () => {
  it("declares a prefers-reduced-motion: reduce block", async () => {
    const css = await loadCss();
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("neutralizes transitions and animations inside the block", async () => {
    const css = await loadCss();
    const block = extractReducedMotionBlock(css);
    expect(block).not.toBeNull();
    const body = block ?? "";
    expect(body).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(body).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(body).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(body).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it("applies the reduction universally via the * selector", async () => {
    const css = await loadCss();
    const block = extractReducedMotionBlock(css);
    expect(block).not.toBeNull();
    const body = block ?? "";
    expect(body).toMatch(/\*\s*,/);
    expect(body).toMatch(/\*::before/);
    expect(body).toMatch(/\*::after/);
  });
});

describe("code text styles in renderer app.css", () => {
  it("disables ligatures in code and editor text", async () => {
    const css = await loadCss();
    const block = extractRuleBlock(css, "code,");

    expect(block).not.toBeNull();
    expect(block).toContain("font-variant-ligatures: none");
    expect(block).toMatch(/font-feature-settings:\s*"liga" 0,\s*"calt" 0/);
  });

  it("applies the no-ligature rule to code blocks and the code editor", async () => {
    const css = await loadCss();
    const selector = css.slice(css.indexOf("code,"), css.indexOf("{", css.indexOf("code,")));

    expect(selector).toContain("code");
    expect(selector).toContain("pre");
    expect(selector).toContain(".hb-editor-textarea");
    expect(selector).toContain(".hb-editor-cm .cm-scroller");
  });
});
