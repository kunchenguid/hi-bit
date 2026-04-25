export type EditorLanguage = "html" | "css" | "javascript";

const EXTENSION_MAP: Record<string, EditorLanguage> = {
  htm: "html",
  html: "html",
  css: "css",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
};

export function detectEditorLanguage(filename: string): EditorLanguage | null {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}
