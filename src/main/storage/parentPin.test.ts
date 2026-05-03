import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readConfig, writeConfig } from "./config";
import { bootstrapLayout, type HiBitLayout } from "./layout";
import { clearParentPin, hasParentPin, setParentPin, verifyParentPin } from "./parentPin";

const TEST_OPTS = { iterations: 100, keyLength: 16, saltBytes: 8 };

describe("parent PIN storage", () => {
  let root: string;
  let layout: HiBitLayout;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-pin-"));
    layout = await bootstrapLayout(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("hasParentPin is false before a pin is set", async () => {
    await expect(hasParentPin(layout)).resolves.toBe(false);
  });

  it("verifyParentPin returns false when no pin is set", async () => {
    await expect(verifyParentPin(layout, "1234")).resolves.toBe(false);
  });

  it("setParentPin + verifyParentPin succeeds with the correct pin", async () => {
    await setParentPin(layout, "1234", TEST_OPTS);
    await expect(verifyParentPin(layout, "1234")).resolves.toBe(true);
  });

  it("verifyParentPin rejects a wrong pin", async () => {
    await setParentPin(layout, "1234", TEST_OPTS);
    await expect(verifyParentPin(layout, "4321")).resolves.toBe(false);
  });

  it("hasParentPin is true after set and false after clear", async () => {
    await setParentPin(layout, "1234", TEST_OPTS);
    await expect(hasParentPin(layout)).resolves.toBe(true);
    await clearParentPin(layout);
    await expect(hasParentPin(layout)).resolves.toBe(false);
    await expect(verifyParentPin(layout, "1234")).resolves.toBe(false);
  });

  it("rejects a pin shorter than 4 characters", async () => {
    await expect(setParentPin(layout, "12", TEST_OPTS)).rejects.toThrow(/at least 4/);
  });

  it("setting the same pin twice produces different salt and hash", async () => {
    const first = await setParentPin(layout, "1234", TEST_OPTS);
    const second = await setParentPin(layout, "1234", TEST_OPTS);
    expect(second.salt).not.toBe(first.salt);
    expect(second.hash).not.toBe(first.hash);
    await expect(verifyParentPin(layout, "1234")).resolves.toBe(true);
  });

  it("setParentPin preserves existing agent config", async () => {
    await writeConfig(layout, {
      version: 2,
      defaultAgent: "claude",
    });
    await setParentPin(layout, "1234", TEST_OPTS);
    const config = await readConfig(layout);
    expect(config.defaultAgent).toBe("claude");
    expect(config.parentPin).toBeDefined();
  });

  it("clearParentPin preserves existing agent config", async () => {
    await writeConfig(layout, {
      version: 2,
      defaultAgent: "codex",
    });
    await setParentPin(layout, "1234", TEST_OPTS);
    await clearParentPin(layout);
    const config = await readConfig(layout);
    expect(config.defaultAgent).toBe("codex");
    expect(config.parentPin).toBeUndefined();
  });

  it("normalizeConfig preserves a well-formed parentPin on reload", async () => {
    await setParentPin(layout, "1234", TEST_OPTS);
    const reloaded = await readConfig(layout);
    expect(reloaded.parentPin?.algorithm).toBe("pbkdf2-sha256");
    expect(reloaded.parentPin?.iterations).toBe(100);
    expect(reloaded.parentPin?.keyLength).toBe(16);
    expect(reloaded.parentPin?.salt).toMatch(/^[0-9a-f]+$/);
    expect(reloaded.parentPin?.hash).toMatch(/^[0-9a-f]+$/);
  });
});
