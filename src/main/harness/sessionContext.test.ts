import type { Profile } from "@shared/profile";
import { describe, expect, it } from "vitest";
import { buildSessionContextPreamble, withSessionContext } from "./sessionContext";

const baseProfile: Profile = {
  id: "ada",
  name: "Ada",
  age: 8,
  interests: ["dinosaurs", "drawing"],
  sessions: { kid: "sess-kid", parent: "sess-parent" },
  createdAt: "2026-04-01T00:00:00.000Z",
  dreamHistory: [],
};

describe("buildSessionContextPreamble", () => {
  it("tags the mode as kid when role is kid", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch(/mode:\s*kid/);
  });

  it("tags the mode as parent when role is parent", () => {
    const text = buildSessionContextPreamble({
      role: "parent",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch(/mode:\s*parent/);
  });

  it("includes the kid's name, age, and interests", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch(/Ada/);
    expect(text).toMatch(/\b8\b/);
    expect(text).toMatch(/dinosaurs/);
    expect(text).toMatch(/drawing/);
  });

  it("keeps the exact full profile name prominent for kid-mode turns", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: { ...baseProfile, name: "Ada Lovelace" },
      profileDir: "/tmp/profiles/ada",
    });

    expect(text).toContain('exact_kid_name: "Ada Lovelace"');
    expect(text).toContain(
      'Use exact_kid_name exactly when you write the kid\'s name; do not shorten it to "Ada".',
    );
  });

  it("includes injected memory with relative source paths when memory is provided", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
      memory: {
        stateMd: "# State\n\nAda likes turtles.\n",
        progressJson: '{"version":1,"knowledgePoints":{}}\n',
      },
    });
    expect(text).toMatch("/tmp/profiles/ada");
    expect(text).toContain('<hi-bit:file path="state.md" format="markdown">');
    expect(text).toContain("Ada likes turtles.");
    expect(text).toContain('<hi-bit:file path="progress.json" format="json">');
    expect(text).toContain('"knowledgePoints"');
  });

  it("mentions the current dream when one is set", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: { ...baseProfile, currentDreamId: "snake" },
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch(/snake/);
  });

  it("includes the current dream learning plan when provided", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: { ...baseProfile, currentDreamId: "click-me" },
      profileDir: "/tmp/profiles/ada",
      learningPlan: {
        dream: { id: "click-me", titleKid: "a page with buttons to click" },
        nextUpKpId: "html-doc-shell",
        requiredKps: [
          {
            id: "html-doc-shell",
            titleKid: "the frame that holds your page",
            whyKid: "every page needs an outside wrapper.",
            status: null,
          },
          {
            id: "html-text-headings",
            titleKid: "big titles and small titles",
            status: "did_with_help",
          },
        ],
      },
    });

    expect(text).toContain("<hi-bit:learning-plan>");
    expect(text).toContain(
      "Before your visible reply ends, include a hidden <hi-bit:progress> block when this turn teaches or checks next_up.",
    );
    expect(text).toContain("Use listed ids like html-text-headings, not tag names like h1.");
    expect(text).toContain("dream: click-me - a page with buttons to click");
    expect(text).toContain("next_up: html-doc-shell");
    expect(text).toContain(
      "- html-doc-shell | the frame that holds your page | status: not_started",
    );
    expect(text).toContain("why: every page needs an outside wrapper.");
    expect(text).toContain(
      "- html-text-headings | big titles and small titles | status: did_with_help",
    );
  });

  it("says no dream chosen yet when currentDreamId is absent", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch(/no dream chosen/i);
  });

  it("tells the kid-mode agent not to break character or narrate infrastructure", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch(/bit/i);
    expect(text).toMatch(/character/i);
  });

  it("tells the parent-mode agent to speak to the parent, not the kid", () => {
    const text = buildSessionContextPreamble({
      role: "parent",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch(/parent/i);
  });

  it("handles a profile with no interests without leaving a dangling 'interests: [, ]' artifact", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: { ...baseProfile, interests: [] },
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).not.toMatch(/\[\s*,/);
    expect(text).not.toMatch(/,\s*\]/);
  });
});

describe("withSessionContext", () => {
  it("prefixes the user prompt with the preamble in start mode", () => {
    const merged = withSessionContext({
      userPrompt: "hi bit",
      role: "kid",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
      mode: "start",
    });
    expect(merged.endsWith("hi bit")).toBe(true);
    expect(merged.length).toBeGreaterThan("hi bit".length);
    expect(merged).toMatch(/<hi-bit:context>/);
    expect(merged).toMatch(/mode:\s*kid/);
  });

  it("returns the raw user prompt untouched in resume mode", () => {
    const merged = withSessionContext({
      userPrompt: "keep going",
      role: "kid",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
      mode: "resume",
    });
    expect(merged).toBe("keep going");
  });
});
