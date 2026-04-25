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

  it("writeConfig roundtrips full config with all harness paths", async () => {
    await writeConfig(layout, {
      version: 1,
      harness: {
        claude: "/usr/local/bin/claude",
        codex: "/opt/bin/codex",
        opencode: "/opt/bin/opencode",
      },
      defaultHarness: "claude",
    });
    await expect(readConfig(layout)).resolves.toEqual({
      version: 1,
      harness: {
        claude: "/usr/local/bin/claude",
        codex: "/opt/bin/codex",
        opencode: "/opt/bin/opencode",
      },
      defaultHarness: "claude",
    });
  });

  it("readConfig drops unknown harness ids and empty paths", async () => {
    await writeFile(
      layout.configFile,
      JSON.stringify({
        version: 1,
        harness: { claude: "/x", codex: "", bogus: "/y" },
        defaultHarness: "nonsense",
      }),
      "utf8",
    );
    const cfg = await readConfig(layout);
    expect(cfg.harness).toEqual({ claude: "/x" });
    expect(cfg.defaultHarness).toBeUndefined();
  });

  it("readConfig falls back to defaults when the file is not an object", async () => {
    await writeFile(layout.configFile, JSON.stringify("nope"), "utf8");
    await expect(readConfig(layout)).resolves.toEqual(defaultConfig());
  });

  it("writeConfig roundtrips a light theme preference", async () => {
    await writeConfig(layout, { version: 1, harness: {}, theme: "light" });
    await expect(readConfig(layout)).resolves.toEqual({
      version: 1,
      harness: {},
      theme: "light",
    });
  });

  it("writeConfig roundtrips a dark theme preference", async () => {
    await writeConfig(layout, { version: 1, harness: {}, theme: "dark" });
    await expect(readConfig(layout)).resolves.toEqual({
      version: 1,
      harness: {},
      theme: "dark",
    });
  });

  it("readConfig drops an unknown theme value", async () => {
    await writeFile(
      layout.configFile,
      JSON.stringify({ version: 1, harness: {}, theme: "neon" }),
      "utf8",
    );
    const cfg = await readConfig(layout);
    expect(cfg.theme).toBeUndefined();
  });

  it("readConfig drops a non-string theme value", async () => {
    await writeFile(
      layout.configFile,
      JSON.stringify({ version: 1, harness: {}, theme: 42 }),
      "utf8",
    );
    const cfg = await readConfig(layout);
    expect(cfg.theme).toBeUndefined();
  });
});
