import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const smokeTestDoc = resolve(__dirname, "../../../docs/first-session-smoke-test.md");

// docs/first-session-smoke-test.md is the scripted walkthrough that mirrors the
// "first 5 minutes" arc. This test pins its structure so the doc stays usable
// as a manual validation script.
describe("shipped first-session smoke test docs", () => {
  it("docs/first-session-smoke-test.md exists and covers each PRD arc step", async () => {
    const text = await readFile(smokeTestDoc, "utf8");
    expect(text).toMatch(/First-session smoke test/i);
    // Each of the 6 PRD §"The first session" arc steps must have a named
    // section in the smoke test so a tester can map it back to the PRD.
    expect(text).toMatch(/Step 1.*Parent installs.*kid profile/i);
    expect(text).toMatch(/Step 2.*Bit greets by name/i);
    expect(text).toMatch(/Step 3.*interests/i);
    expect(text).toMatch(/Step 4.*dream menu/i);
    expect(text).toMatch(/Step 5.*picks a dream.*commits/i);
    expect(text).toMatch(/Step 6.*Typed something real.*saved a file/i);
  });

  it("docs/first-session-smoke-test.md references the key components of each step", async () => {
    const text = await readFile(smokeTestDoc, "utf8");
    // Spot-check the pointers a tester would jump to when a step fails.
    expect(text).toMatch(/ProfileGate\.tsx/);
    expect(text).toMatch(/CreateProfileForm\.tsx/);
    expect(text).toMatch(/HarnessSetup\.tsx/);
    expect(text).toMatch(/DreamPicker\.tsx/);
    expect(text).toMatch(/KidChat\.tsx/);
    expect(text).toMatch(/CodeEditor\.tsx/);
    expect(text).toMatch(/buildPreview/);
    expect(text).toMatch(/REFERENCE_AGENT/);
  });

  it("docs/first-session-smoke-test.md pins the 5-minute PRD budget", async () => {
    const text = await readFile(smokeTestDoc, "utf8");
    expect(text).toMatch(/under 5 minutes/i);
  });

  it("docs/first-session-smoke-test.md avoids em-dashes per the house voice rules", async () => {
    const text = await readFile(smokeTestDoc, "utf8");
    expect(text).not.toMatch(/—/);
  });
});
