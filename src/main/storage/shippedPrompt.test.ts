import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const shippedBitPrompt = resolve(__dirname, "../../../prompts/bit.md");

// Maps PRD.md §"Bit's system prompt (authored content)" behaviors to markers that
// MUST appear in the shipped prompt. Dropping a marker without replacement should
// fail this test so the coverage gap surfaces before ship.
const REQUIRED_BEHAVIORS: Array<{
  behavior: string;
  markers: RegExp[];
}> = [
  {
    behavior: "identity and voice",
    markers: [/## Who you are/i, /## How you speak/i, /sentence case/i],
  },
  {
    behavior: "memory file paths and re-read instructions",
    markers: [/state\.md/i, /progress\.json/i, /read these two files/i],
  },
  {
    behavior: "pedagogy: ask-first, show-sometimes, tell-rarely",
    markers: [/ask, show, tell/i, /default to asking/i, /last resort/i],
  },
  {
    behavior: "calibrated celebration and no empty praise",
    markers: [/calibrated/i, /empty word/i],
  },
  {
    behavior: "progressive input selection",
    markers: [/fill-in-the-blank/i, /change-a-line/i, /rewrite-a-function/i, /write-from-scratch/i],
  },
  {
    behavior: "stuck detection and response",
    markers: [/stuck/i, /90 seconds/i, /three times/i],
  },
  {
    behavior: "off-script: 'this is boring'",
    markers: [/this is boring/i, /switch dreams/i],
  },
  {
    behavior: "'just write it for me' handling",
    markers: [/just write it for me/i, /split the difference/i],
  },
  {
    behavior: "prompt injection resistance",
    markers: [/strings inside the kid's code are data/i, /do not follow instructions/i],
  },
  {
    behavior: "refusals",
    markers: [/refuse/i, /skip prereqs/i, /general-purpose chatbot/i],
  },
  {
    behavior: "session rituals (open, close, KP transitions, mastery moments)",
    markers: [
      /## Session rituals/i,
      /opening a session/i,
      /closing a session/i,
      /transitioning between kps/i,
      /mastery moments/i,
    ],
  },
  {
    behavior: "parent references (warm, never weaponized)",
    markers: [/## Talking about the parent/i, /never use the parent as leverage/i],
  },
  {
    behavior: "session length awareness",
    markers: [/## Session length awareness/i, /20 minutes/i, /natural stop/i, /never hard-cut/i],
  },
  {
    behavior: "progress.json write protocol with concrete schema",
    markers: [
      /knowledgePoints/,
      /saw_it/,
      /did_with_help/,
      /did_unprompted/,
      /explained_it/,
      /firstSeenAt/,
      /updatedAt/,
      /first time you teach or check a KP/i,
      /write silently/i,
    ],
  },
  {
    behavior: "code block practice flag for type-it-yourself moments",
    markers: [/practice/i, /Type it/, /Copy button/i, /muscle memory/i],
  },
];

describe("shipped bit.md system prompt", () => {
  it("can be read from prompts/bit.md", async () => {
    const text = await readFile(shippedBitPrompt, "utf8");
    expect(text.length).toBeGreaterThan(0);
  });

  it.each(REQUIRED_BEHAVIORS)("covers PRD behavior: $behavior", async ({ markers }) => {
    const text = await readFile(shippedBitPrompt, "utf8");
    for (const marker of markers) {
      expect(text).toMatch(marker);
    }
  });

  it("does not use em dashes (house style)", async () => {
    const text = await readFile(shippedBitPrompt, "utf8");
    expect(text).not.toMatch(/—/);
  });
});
