import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "@shared/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadOrInitConfig, readConfig, writeConfig } from "./config";
import { bootstrapLayout, type HiBitLayout } from "./layout";

describe("config storage", () => {
  let root: string;
  let layout: HiBitLayout;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-config-"));
    layout = await bootstrapLayout(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("readConfig returns the default when the file is missing", async () => {
    await expect(readConfig(layout)).resolves.toEqual(defaultConfig());
  });

  it("loadOrInitConfig writes a default config.json on first run", async () => {
    const cfg = await loadOrInitConfig(layout);
    expect(cfg).toEqual(defaultConfig());
    const raw = await readFile(layout.configFile, "utf8");
    expect(JSON.parse(raw)).toEqual(defaultConfig());
  });

  it("writeConfig roundtrips the selected ACP agent without binary paths", async () => {
    await writeConfig(layout, {
      version: 2,
      defaultAgent: "claude",
    });
    await expect(readConfig(layout)).resolves.toEqual({
      version: 2,
      defaultAgent: "claude",
    });
  });

  it("readConfig migrates v1 defaultHarness and drops binary paths", async () => {
    await writeFile(
      layout.configFile,
      JSON.stringify({
        version: 1,
        harness: { claude: "/x", codex: "", bogus: "/y" },
        defaultHarness: "codex",
      }),
      "utf8",
    );
    const cfg = await readConfig(layout);
    expect(cfg).toEqual({ version: 2, defaultAgent: "codex" });
  });

  it("readConfig drops unsupported default agents", async () => {
    await writeFile(
      layout.configFile,
      JSON.stringify({ version: 2, defaultAgent: "gemini" }),
      "utf8",
    );
    const cfg = await readConfig(layout);
    expect(cfg.defaultAgent).toBeUndefined();
  });

  it("readConfig falls back to defaults when the file is not an object", async () => {
    await writeFile(layout.configFile, JSON.stringify("nope"), "utf8");
    await expect(readConfig(layout)).resolves.toEqual(defaultConfig());
  });

  it("writeConfig roundtrips a light theme preference", async () => {
    await writeConfig(layout, { version: 2, theme: "light" });
    await expect(readConfig(layout)).resolves.toEqual({
      version: 2,
      theme: "light",
    });
  });

  it("writeConfig roundtrips a dark theme preference", async () => {
    await writeConfig(layout, { version: 2, theme: "dark" });
    await expect(readConfig(layout)).resolves.toEqual({
      version: 2,
      theme: "dark",
    });
  });

  it("readConfig drops an unknown theme value", async () => {
    await writeFile(layout.configFile, JSON.stringify({ version: 2, theme: "neon" }), "utf8");
    const cfg = await readConfig(layout);
    expect(cfg.theme).toBeUndefined();
  });

  it("readConfig drops a non-string theme value", async () => {
    await writeFile(layout.configFile, JSON.stringify({ version: 2, theme: 42 }), "utf8");
    const cfg = await readConfig(layout);
    expect(cfg.theme).toBeUndefined();
  });
});
