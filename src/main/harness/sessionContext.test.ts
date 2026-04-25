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

  it("includes the absolute profile directory so Bit can read state.md and progress.json", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: baseProfile,
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch("/tmp/profiles/ada");
    expect(text).toMatch(/state\.md/);
    expect(text).toMatch(/progress\.json/);
  });

  it("mentions the current dream when one is set", () => {
    const text = buildSessionContextPreamble({
      role: "kid",
      profile: { ...baseProfile, currentDreamId: "snake" },
      profileDir: "/tmp/profiles/ada",
    });
    expect(text).toMatch(/snake/);
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
