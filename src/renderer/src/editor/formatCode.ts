import * as prettierBabel from "prettier/plugins/babel";
import * as prettierEstree from "prettier/plugins/estree";
import * as prettierHtml from "prettier/plugins/html";
import * as prettierPostcss from "prettier/plugins/postcss";
import * as prettier from "prettier/standalone";
import { detectEditorLanguage, type EditorLanguage } from "./fileLanguage";

export type FormatResult = {
  content: string;
  changed: boolean;
};

// Tuned for kid readability: short-ish lines that fit a laptop without
// horizontal scroll, 2-space indent so nesting stays visible, explicit
// semicolons, and double quotes everywhere so HTML attributes and JS strings
// look the same. htmlWhitespaceSensitivity "ignore" lets HTML actually break
// onto multiple lines instead of staying as one long ribbon.
const KID_PRETTIER_OPTIONS = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  bracketSameLine: true,
  htmlWhitespaceSensitivity: "ignore" as const,
  arrowParens: "always" as const,
  trailingComma: "all" as const,
  endOfLine: "lf" as const,
};

const PARSER_BY_LANGUAGE: Record<EditorLanguage, string> = {
  html: "html",
  css: "css",
  javascript: "babel",
};

const PRETTIER_PLUGINS = [prettierHtml, prettierPostcss, prettierBabel, prettierEstree];

export async function formatCode(filename: string, content: string): Promise<FormatResult> {
  const language = detectEditorLanguage(filename);
  if (!language) {
    return { content, changed: false };
  }
  const parser = PARSER_BY_LANGUAGE[language];
  try {
    const formatted = await prettier.format(content, {
      ...KID_PRETTIER_OPTIONS,
      parser,
      plugins: PRETTIER_PLUGINS,
    });
    return { content: formatted, changed: formatted !== content };
  } catch {
    return { content, changed: false };
  }
}
