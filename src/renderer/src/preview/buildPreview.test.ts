import type { ProjectFile } from "@shared/project";
import { describe, expect, it } from "vitest";
import { buildPreviewSrcdoc } from "./buildPreview";

function file(name: string, content: string): ProjectFile {
  return { name, content };
}

describe("buildPreviewSrcdoc", () => {
  it("returns no-index-html when there is no index.html", () => {
    const result = buildPreviewSrcdoc([file("style.css", "body {}")]);
    expect(result).toEqual({ ok: false, reason: "no-index-html" });
  });

  it("returns index.html as-is when there are no external references", () => {
    const html = "<!doctype html><html><body><h1>hi</h1></body></html>";
    const result = buildPreviewSrcdoc([file("index.html", html)]);
    expect(result).toEqual({ ok: true, srcdoc: html });
  });

  it("inlines a linked stylesheet", () => {
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body></body></html>';
    const css = "body { background: red; }";
    const result = buildPreviewSrcdoc([file("index.html", html), file("style.css", css)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain("<style>");
    expect(result.srcdoc).toContain(css);
    expect(result.srcdoc).not.toContain('<link rel="stylesheet"');
  });

  it("inlines a script src reference", () => {
    const html = '<!doctype html><html><body><script src="app.js"></script></body></html>';
    const js = "console.log('hi');";
    const result = buildPreviewSrcdoc([file("index.html", html), file("app.js", js)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain("<script>");
    expect(result.srcdoc).toContain(js);
    expect(result.srcdoc).not.toContain('<script src="app.js">');
  });

  it("leaves the original tag when the referenced file is missing", () => {
    const html = '<html><head><link rel="stylesheet" href="missing.css"></head></html>';
    const result = buildPreviewSrcdoc([file("index.html", html)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain('<link rel="stylesheet" href="missing.css">');
  });

  it("inlines multiple stylesheets and scripts in order", () => {
    const html = `<html><head>
<link rel="stylesheet" href="a.css">
<link rel="stylesheet" href="b.css">
</head><body>
<script src="one.js"></script>
<script src="two.js"></script>
</body></html>`;
    const files = [
      file("index.html", html),
      file("a.css", "/* A */"),
      file("b.css", "/* B */"),
      file("one.js", "/* ONE */"),
      file("two.js", "/* TWO */"),
    ];
    const result = buildPreviewSrcdoc(files);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain("/* A */");
    expect(result.srcdoc).toContain("/* B */");
    expect(result.srcdoc).toContain("/* ONE */");
    expect(result.srcdoc).toContain("/* TWO */");
    expect(result.srcdoc.indexOf("/* A */")).toBeLessThan(result.srcdoc.indexOf("/* B */"));
    expect(result.srcdoc.indexOf("/* ONE */")).toBeLessThan(result.srcdoc.indexOf("/* TWO */"));
  });

  it("handles single-quoted attributes", () => {
    const html = "<html><head><link rel='stylesheet' href='style.css'></head></html>";
    const result = buildPreviewSrcdoc([file("index.html", html), file("style.css", "x{}")]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain("x{}");
  });

  it("handles href-before-rel link attribute order", () => {
    const html = '<link href="style.css" rel="stylesheet">';
    const result = buildPreviewSrcdoc([
      file("index.html", `<html><head>${html}</head></html>`),
      file("style.css", "body{}"),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain("<style>");
    expect(result.srcdoc).toContain("body{}");
  });

  it("strips a leading ./ from referenced paths", () => {
    const html = '<link rel="stylesheet" href="./style.css">';
    const result = buildPreviewSrcdoc([
      file("index.html", `<html><head>${html}</head></html>`),
      file("style.css", "y{}"),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.srcdoc).toContain("y{}");
  });

  it("matches INDEX.HTML case-insensitively when a kid names the file oddly", () => {
    const result = buildPreviewSrcdoc([file("INDEX.html", "<html></html>")]);
    expect(result).toEqual({ ok: true, srcdoc: "<html></html>" });
  });
});
