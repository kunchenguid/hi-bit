import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const smokeTestDoc = resolve(__dirname, "../../../docs/first-session-smoke-test.md");
const v1Gaps = resolve(__dirname, "../../../V1_GAPS.md");
const prd = resolve(__dirname, "../../../PRD.md");

// V1_GAPS.md flagged "First-session smoke test" as a pre-ship manual validation
// gap for the PRD §"The first session" 5-minute arc. iter-25 closed that gap by
// landing docs/first-session-smoke-test.md as a scripted walkthrough covering
// every step of the arc. This test pins the closure so the doc cannot silently
// drift out of sync with the PRD arc and so the gap cannot reopen.
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
    expect(text).toMatch(/REFERENCE_HARNESS/);
  });

  it("docs/first-session-smoke-test.md pins the 5-minute PRD budget", async () => {
    const text = await readFile(smokeTestDoc, "utf8");
    expect(text).toMatch(/under 5 minutes/i);
  });

  it("docs/first-session-smoke-test.md avoids em-dashes per the house voice rules", async () => {
    const text = await readFile(smokeTestDoc, "utf8");
    expect(text).not.toMatch(/—/);
  });

  it("PRD.md still lists the 6-step first-session arc the smoke test mirrors", async () => {
    // Guard against PRD drift: if someone renumbers or retitles the first
    // session arc, the smoke test step headings will fall out of sync.
    const text = await readFile(prd, "utf8");
    const firstSessionIndex = text.indexOf("The first session");
    expect(firstSessionIndex).toBeGreaterThan(-1);
    const arcBlock = text.slice(firstSessionIndex, firstSessionIndex + 2000);
    expect(arcBlock).toMatch(/1\.\s*Parent installs/i);
    expect(arcBlock).toMatch(/2\.\s*Kid opens the app/i);
    expect(arcBlock).toMatch(/3\.\s*Bit asks about what they like/i);
    expect(arcBlock).toMatch(/4\.\s*Bit shows a dream menu/i);
    expect(arcBlock).toMatch(/5\.\s*Kid picks a dream/i);
    expect(arcBlock).toMatch(/6\.\s*Within five minutes/i);
  });

  it("V1_GAPS.md no longer lists the first-session smoke test as an open flag", async () => {
    const text = await readFile(v1Gaps, "utf8");
    // The gap doc should now link to the new smoke-test doc rather than
    // describe the gap as undecided.
    expect(text).toMatch(/first-session-smoke-test\.md/);
    expect(text).toMatch(/closed iter-25/i);
    // The old "no end-to-end test or scripted walkthrough" phrasing must not
    // reappear verbatim.
    expect(text).not.toMatch(/no end-to-end test or scripted walkthrough/i);
  });
});
