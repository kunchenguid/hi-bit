import type { ProjectFile } from "@shared/project";

export type PreviewResult = { ok: true; srcdoc: string } | { ok: false; reason: "no-index-html" };

const STYLESHEET_LINK_PATTERN =
  /<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/gi;

const STYLESHEET_LINK_PATTERN_REV =
  /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']stylesheet["'][^>]*\/?\s*>/gi;

const SCRIPT_SRC_PATTERN = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi;

function findFile(files: readonly ProjectFile[], name: string): ProjectFile | undefined {
  const normalized = name.replace(/^\.?\/+/, "");
  return files.find((f) => f.name === normalized);
}

function inlineStylesheets(html: string, files: readonly ProjectFile[]): string {
  const replaceLink = (_match: string, href: string): string => {
    const file = findFile(files, href);
    if (!file) return _match;
    return `<style>\n${file.content}\n</style>`;
  };
  return html
    .replace(STYLESHEET_LINK_PATTERN, replaceLink)
    .replace(STYLESHEET_LINK_PATTERN_REV, replaceLink);
}

function inlineScripts(html: string, files: readonly ProjectFile[]): string {
  return html.replace(SCRIPT_SRC_PATTERN, (match, src) => {
    const file = findFile(files, src);
    if (!file) return match;
    return `<script>\n${file.content}\n</script>`;
  });
}

export function buildPreviewSrcdoc(files: readonly ProjectFile[]): PreviewResult {
  const index = files.find((f) => f.name.toLowerCase() === "index.html");
  if (!index) {
    return { ok: false, reason: "no-index-html" };
  }
  let html = index.content;
  html = inlineStylesheets(html, files);
  html = inlineScripts(html, files);
  return { ok: true, srcdoc: html };
}
