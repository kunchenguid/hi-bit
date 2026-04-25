import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import type { HiBitLayout } from "./layout";

export function promptsBitPath(layout: HiBitLayout): string {
  return join(layout.promptsDir, "bit.md");
}

export async function seedBitPrompt(layout: HiBitLayout, source: string): Promise<string> {
  const dest = promptsBitPath(layout);
  await copyFile(source, dest);
  return dest;
}
