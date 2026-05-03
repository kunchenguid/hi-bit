import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Dream } from "@shared/dreams";
import type { ParentFlag } from "@shared/flag";
import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import type { TranscriptEvent } from "@shared/transcript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrapLayout, bootstrapProfileDirs, profilePathsFor } from "./layout";
import {
  applyCurrentDreamToStateMd,
  applyCurrentSessionToStateMd,
  applyFlagsToStateMd,
  applyParentNotesToStateMd,
  applyProfileSectionToStateMd,
  applyRecentParentDirectivesToStateMd,
  applyRecentSessionSummariesToStateMd,
  applyVoicePreferencesToStateMd,
  computeCurrentSession,
  renderCurrentDreamSection,
  renderCurrentSessionSection,
  renderFlagsSection,
  renderParentNotesSection,
  renderProfileSection,
  renderRecentParentDirectivesSection,
  renderRecentSessionSummariesSection,
  renderVoicePreferencesSection,
  summarizeSessionLog,
  updateStateMdCurrentDream,
  updateStateMdCurrentSession,
  updateStateMdFlags,
  updateStateMdParentNotes,
  updateStateMdProfile,
  updateStateMdRecentParentDirectives,
  updateStateMdRecentSessionSummaries,
  updateStateMdVoicePreferences,
} from "./stateFile";

function makeFlag(overrides: Partial<ParentFlag> = {}): ParentFlag {
  return {
    flaggedAt: "2026-04-23T10:15:00.000Z",
    sessionId: "sess-kid-1",
    messageTimestamp: "2026-04-23T09:45:00.000Z",
    messageRole: "kid",
    messageKind: "assistant_message",
    messageText: "lol just write it for you",
    reason: "do not write it without teaching",
    ...overrides,
  };
}

describe("renderFlagsSection", () => {
  it("returns 'None yet.' for an empty list", () => {
    expect(renderFlagsSection([])).toBe("None yet.");
  });

  it("formats an assistant_message flag as 'Bit said'", () => {
    const body = renderFlagsSection([makeFlag()]);
    expect(body).toContain("Bit said: lol just write it for you");
    expect(body).toContain("Reason: do not write it without teaching");
    expect(body).toContain("kid session");
  });

  it("formats a user_message flag from a kid as 'Kid said'", () => {
    const body = renderFlagsSection([
      makeFlag({ messageKind: "user_message", messageText: "boring" }),
    ]);
    expect(body).toContain("Kid said: boring");
  });

  it("formats a user_message flag from the parent session as 'Parent said'", () => {
    const body = renderFlagsSection([
      makeFlag({
        messageRole: "parent",
        messageKind: "user_message",
        messageText: "skip CSS colors",
      }),
    ]);
    expect(body).toContain("Parent said: skip CSS colors");
  });

  it("collapses newlines in messageText into single spaces", () => {
    const body = renderFlagsSection([
      makeFlag({ messageText: "line one\nline two\n\nline three" }),
    ]);
    expect(body).toContain("Bit said: line one line two line three");
    expect(body).not.toContain("line one\nline two");
  });

  it("renders multiple flags in order, separated by blank lines", () => {
    const flags = [
      makeFlag({ flaggedAt: "2026-04-23T09:00:00.000Z", messageText: "first" }),
      makeFlag({ flaggedAt: "2026-04-23T10:00:00.000Z", messageText: "second" }),
    ];
    const body = renderFlagsSection(flags);
    const firstIdx = body.indexOf("first");
    const secondIdx = body.indexOf("second");
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});

describe("applyFlagsToStateMd", () => {
  it("replaces 'None yet.' under '## Flagged messages' with the formatted list", () => {
    const original = "# State\n\n## Flagged messages\n\nNone yet.\n";
    const result = applyFlagsToStateMd(original, [makeFlag()]);
    expect(result).not.toContain("None yet.");
    expect(result).toContain("Bit said: lol just write it for you");
    expect(result.startsWith("# State\n\n")).toBe(true);
  });

  it("replaces existing flag content with 'None yet.' when given an empty list", () => {
    const original = "## Flagged messages\n\n- Flagged on x\n  - Reason: y\n";
    expect(applyFlagsToStateMd(original, [])).toContain("None yet.");
  });

  it("preserves sections that come before and after the flagged-messages section", () => {
    const original = [
      "# State",
      "",
      "## Profile",
      "",
      "Name: Ada",
      "",
      "## Flagged messages",
      "",
      "None yet.",
      "",
      "## Recent parent directives",
      "",
      "Keep this around.",
      "",
    ].join("\n");
    const result = applyFlagsToStateMd(original, [makeFlag()]);
    expect(result).toContain("Name: Ada");
    expect(result).toContain("## Recent parent directives\n\nKeep this around.");
    expect(result).toContain("Bit said: lol just write it for you");
  });

  it("appends a new flagged-messages section when the file lacks one", () => {
    const original = "# State\n\n## Profile\n\nName: Ada\n";
    const result = applyFlagsToStateMd(original, [makeFlag()]);
    expect(result).toContain("## Profile");
    expect(result).toMatch(/## Flagged messages\n\n[\s\S]*Bit said: lol just write it for you/);
  });

  it("is idempotent for the same flag list", () => {
    const original = "## Flagged messages\n\nNone yet.\n";
    const once = applyFlagsToStateMd(original, [makeFlag()]);
    const twice = applyFlagsToStateMd(once, [makeFlag()]);
    expect(twice).toBe(once);
  });
});

function makeDream(overrides: Partial<Dream> = {}): Dream {
  return {
    id: "pet-page",
    title_parent: "Pet profile page",
    title_kid: "a page about your pet",
    summary_kid: "make a webpage starring your pet, with a photo and facts",
    categories: ["personal", "creative"],
    interest_tags: ["animals"],
    requires: ["html-doc-shell", "html-text-headings"],
    style_hints: [],
    emoji: "🐶",
    ...overrides,
    difficulty: overrides.difficulty ?? 1,
  };
}

describe("renderCurrentDreamSection", () => {
  it("returns 'None selected yet.' when no dream is passed", () => {
    expect(renderCurrentDreamSection(null)).toBe("None selected yet.");
  });

  it("includes the kid title, parent title, summary, and categories", () => {
    const body = renderCurrentDreamSection(makeDream());
    expect(body).toContain("Pet profile page");
    expect(body).toContain("a page about your pet");
    expect(body).toContain("make a webpage starring your pet");
    expect(body).toContain("personal, creative");
    expect(body).toContain("pet-page");
  });

  it("collapses a multi-line summary onto a single line", () => {
    const body = renderCurrentDreamSection(
      makeDream({ summary_kid: "line one\nline two\n\nline three" }),
    );
    expect(body).toContain("line one line two line three");
    expect(body).not.toContain("line one\nline two");
  });
});

describe("applyCurrentDreamToStateMd", () => {
  it("replaces 'None selected yet.' under '## Current dream' with the rendered dream", () => {
    const original = "# State\n\n## Current dream\n\nNone selected yet.\n";
    const result = applyCurrentDreamToStateMd(original, makeDream());
    expect(result).not.toContain("None selected yet.");
    expect(result).toContain("Pet profile page");
  });

  it("restores 'None selected yet.' when passed null", () => {
    const original =
      "## Current dream\n\n- Title: Old dream\n- For you: old summary\n- Categories: art\n";
    expect(applyCurrentDreamToStateMd(original, null)).toContain("None selected yet.");
  });

  it("preserves sections that come before and after the current-dream section", () => {
    const original = [
      "# State",
      "",
      "## Profile",
      "",
      "Name: Ada",
      "",
      "## Current dream",
      "",
      "None selected yet.",
      "",
      "## Recent parent directives",
      "",
      "Keep this around.",
      "",
    ].join("\n");
    const result = applyCurrentDreamToStateMd(original, makeDream());
    expect(result).toContain("Name: Ada");
    expect(result).toContain("## Recent parent directives\n\nKeep this around.");
    expect(result).toContain("Pet profile page");
  });

  it("appends a new current-dream section when the file lacks one", () => {
    const original = "# State\n\n## Profile\n\nName: Ada\n";
    const result = applyCurrentDreamToStateMd(original, makeDream());
    expect(result).toContain("## Profile");
    expect(result).toMatch(/## Current dream\n\n[\s\S]*Pet profile page/);
  });

  it("is idempotent for the same dream", () => {
    const original = "## Current dream\n\nNone selected yet.\n";
    const once = applyCurrentDreamToStateMd(original, makeDream());
    const twice = applyCurrentDreamToStateMd(once, makeDream());
    expect(twice).toBe(once);
  });
});

describe("updateStateMdCurrentDream", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-dream-state-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
    await writeFile(paths.stateFile, "# State\n\n## Current dream\n\nNone selected yet.\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes the rendered current-dream section back to state.md", async () => {
    await updateStateMdCurrentDream(paths, makeDream());
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("Pet profile page");
    expect(updated).not.toContain("None selected yet.");
  });

  it("creates a current-dream section if state.md lacks one", async () => {
    await writeFile(paths.stateFile, "# State\n\n## Profile\n\nName: Ada\n", "utf8");
    await updateStateMdCurrentDream(paths, makeDream());
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("## Profile");
    expect(updated).toContain("## Current dream");
    expect(updated).toContain("Pet profile page");
  });
});

function makeDirective(overrides: Partial<TranscriptEvent> = {}): TranscriptEvent {
  return {
    timestamp: "2026-04-23T10:00:00.000Z",
    role: "parent",
    sessionId: "sess-parent-1",
    kind: "user_message",
    text: "skip CSS colors this week, she knows them",
    ...overrides,
  };
}

describe("renderRecentParentDirectivesSection", () => {
  it("returns 'None yet.' for an empty list", () => {
    expect(renderRecentParentDirectivesSection([])).toBe("None yet.");
  });

  it("renders a single directive as a timestamped bullet", () => {
    const body = renderRecentParentDirectivesSection([makeDirective()]);
    expect(body).toContain("2026-04-23T10:00:00.000Z");
    expect(body).toContain("skip CSS colors this week, she knows them");
    expect(body.startsWith("- ")).toBe(true);
  });

  it("collapses multi-line directive text onto a single line", () => {
    const body = renderRecentParentDirectivesSection([
      makeDirective({ text: "line one\nline two\n\nline three" }),
    ]);
    expect(body).toContain("line one line two line three");
    expect(body).not.toContain("line one\nline two");
  });

  it("renders multiple directives in chronological order, oldest first", () => {
    const body = renderRecentParentDirectivesSection([
      makeDirective({ timestamp: "2026-04-23T09:00:00.000Z", text: "first" }),
      makeDirective({ timestamp: "2026-04-23T10:00:00.000Z", text: "second" }),
    ]);
    const firstIdx = body.indexOf("first");
    const secondIdx = body.indexOf("second");
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });
});

describe("applyRecentParentDirectivesToStateMd", () => {
  it("replaces 'None yet.' under '## Recent parent directives' with the formatted list", () => {
    const original = "# State\n\n## Recent parent directives\n\nNone yet.\n";
    const result = applyRecentParentDirectivesToStateMd(original, [makeDirective()]);
    expect(result).not.toContain("None yet.");
    expect(result).toContain("skip CSS colors this week, she knows them");
    expect(result.startsWith("# State\n\n")).toBe(true);
  });

  it("restores 'None yet.' when passed an empty list", () => {
    const original = "## Recent parent directives\n\n- 2026-04-23T10:00:00.000Z: skip colors\n";
    expect(applyRecentParentDirectivesToStateMd(original, [])).toContain("None yet.");
  });

  it("preserves sections that come before and after the directives section", () => {
    const original = [
      "# State",
      "",
      "## Profile",
      "",
      "Name: Ada",
      "",
      "## Recent parent directives",
      "",
      "None yet.",
      "",
      "## Flagged messages",
      "",
      "Keep this around.",
      "",
    ].join("\n");
    const result = applyRecentParentDirectivesToStateMd(original, [makeDirective()]);
    expect(result).toContain("Name: Ada");
    expect(result).toContain("## Flagged messages\n\nKeep this around.");
    expect(result).toContain("skip CSS colors this week, she knows them");
  });

  it("appends a new directives section when the file lacks one", () => {
    const original = "# State\n\n## Profile\n\nName: Ada\n";
    const result = applyRecentParentDirectivesToStateMd(original, [makeDirective()]);
    expect(result).toContain("## Profile");
    expect(result).toMatch(/## Recent parent directives\n\n[\s\S]*skip CSS colors/);
  });

  it("is idempotent for the same directive list", () => {
    const original = "## Recent parent directives\n\nNone yet.\n";
    const once = applyRecentParentDirectivesToStateMd(original, [makeDirective()]);
    const twice = applyRecentParentDirectivesToStateMd(once, [makeDirective()]);
    expect(twice).toBe(once);
  });
});

describe("updateStateMdRecentParentDirectives", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-directives-state-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
    await writeFile(
      paths.stateFile,
      "# State\n\n## Recent parent directives\n\nNone yet.\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes the rendered directive list back to state.md", async () => {
    await updateStateMdRecentParentDirectives(paths, [makeDirective()]);
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("skip CSS colors this week, she knows them");
    expect(updated).not.toContain("None yet.");
  });

  it("creates a directives section if state.md lacks one", async () => {
    await writeFile(paths.stateFile, "# State\n\n## Profile\n\nName: Ada\n", "utf8");
    await updateStateMdRecentParentDirectives(paths, [makeDirective()]);
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("## Profile");
    expect(updated).toContain("## Recent parent directives");
    expect(updated).toContain("skip CSS colors");
  });
});

function makeEntry(overrides: Partial<HarnessInvocationLogEntry> = {}): HarnessInvocationLogEntry {
  return {
    timestamp: "2026-04-23T10:00:00.000Z",
    harness: "claude",
    role: "kid",
    sessionId: "sess-kid-1",
    mode: "start",
    durationMs: 12_000,
    exitCode: 0,
    signal: null,
    ...overrides,
  };
}

describe("summarizeSessionLog", () => {
  it("returns an empty list for no entries", () => {
    expect(summarizeSessionLog([])).toEqual([]);
  });

  it("aggregates multiple entries for the same sessionId into one summary", () => {
    const summaries = summarizeSessionLog([
      makeEntry({ timestamp: "2026-04-23T10:00:00.000Z", durationMs: 10_000 }),
      makeEntry({ timestamp: "2026-04-23T10:05:00.000Z", durationMs: 5_000 }),
    ]);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      sessionId: "sess-kid-1",
      role: "kid",
      turnCount: 2,
      totalDurationMs: 15_000,
      firstAt: "2026-04-23T10:00:00.000Z",
      lastAt: "2026-04-23T10:05:00.000Z",
    });
  });

  it("groups entries with distinct sessionIds into separate summaries", () => {
    const summaries = summarizeSessionLog([
      makeEntry({ sessionId: "sess-kid-1", timestamp: "2026-04-23T10:00:00.000Z" }),
      makeEntry({
        sessionId: "sess-parent-1",
        role: "parent",
        timestamp: "2026-04-23T11:00:00.000Z",
      }),
    ]);
    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => s.sessionId)).toEqual(["sess-kid-1", "sess-parent-1"]);
  });

  it("orders summaries chronologically by lastAt", () => {
    const summaries = summarizeSessionLog([
      makeEntry({ sessionId: "later", timestamp: "2026-04-23T12:00:00.000Z" }),
      makeEntry({ sessionId: "earlier", timestamp: "2026-04-23T09:00:00.000Z" }),
    ]);
    expect(summaries.map((s) => s.sessionId)).toEqual(["earlier", "later"]);
  });
});

describe("renderRecentSessionSummariesSection", () => {
  it("returns 'None yet.' for an empty list", () => {
    expect(renderRecentSessionSummariesSection([])).toBe("None yet.");
  });

  it("renders a single session summary with role, turn count, and duration", () => {
    const body = renderRecentSessionSummariesSection([
      {
        sessionId: "sess-kid-1",
        role: "kid",
        firstAt: "2026-04-23T10:00:00.000Z",
        lastAt: "2026-04-23T10:05:00.000Z",
        turnCount: 3,
        totalDurationMs: 90_000,
      },
    ]);
    expect(body).toContain("2026-04-23T10:05:00.000Z");
    expect(body).toContain("kid session");
    expect(body).toContain("3 turns");
    expect(body).toContain("1m 30s");
  });

  it("uses singular 'turn' when turnCount is 1", () => {
    const body = renderRecentSessionSummariesSection([
      {
        sessionId: "x",
        role: "parent",
        firstAt: "2026-04-23T10:00:00.000Z",
        lastAt: "2026-04-23T10:00:00.000Z",
        turnCount: 1,
        totalDurationMs: 2_000,
      },
    ]);
    expect(body).toContain("1 turn");
    expect(body).not.toContain("1 turns");
  });
});

describe("applyRecentSessionSummariesToStateMd", () => {
  const summary = {
    sessionId: "sess-kid-1",
    role: "kid" as const,
    firstAt: "2026-04-23T10:00:00.000Z",
    lastAt: "2026-04-23T10:05:00.000Z",
    turnCount: 2,
    totalDurationMs: 30_000,
  };

  it("replaces 'None yet.' under '## Recent session summaries'", () => {
    const original = "# State\n\n## Recent session summaries\n\nNone yet.\n";
    const result = applyRecentSessionSummariesToStateMd(original, [summary]);
    expect(result).not.toContain("None yet.");
    expect(result).toContain("kid session");
    expect(result.startsWith("# State\n\n")).toBe(true);
  });

  it("restores 'None yet.' when passed an empty list", () => {
    const original =
      "## Recent session summaries\n\n- 2026-04-23T10:05:00.000Z (kid session): 2 turns, 30s total\n";
    expect(applyRecentSessionSummariesToStateMd(original, [])).toContain("None yet.");
  });

  it("preserves sections that come before and after the session-summaries section", () => {
    const original = [
      "# State",
      "",
      "## Profile",
      "",
      "Name: Ada",
      "",
      "## Recent session summaries",
      "",
      "None yet.",
      "",
      "## Flagged messages",
      "",
      "Keep this around.",
      "",
    ].join("\n");
    const result = applyRecentSessionSummariesToStateMd(original, [summary]);
    expect(result).toContain("Name: Ada");
    expect(result).toContain("## Flagged messages\n\nKeep this around.");
    expect(result).toContain("kid session");
  });

  it("appends a new session-summaries section when the file lacks one", () => {
    const original = "# State\n\n## Profile\n\nName: Ada\n";
    const result = applyRecentSessionSummariesToStateMd(original, [summary]);
    expect(result).toContain("## Profile");
    expect(result).toMatch(/## Recent session summaries\n\n[\s\S]*kid session/);
  });

  it("is idempotent for the same summary list", () => {
    const original = "## Recent session summaries\n\nNone yet.\n";
    const once = applyRecentSessionSummariesToStateMd(original, [summary]);
    const twice = applyRecentSessionSummariesToStateMd(once, [summary]);
    expect(twice).toBe(once);
  });
});

describe("updateStateMdRecentSessionSummaries", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-session-summaries-state-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
    await writeFile(
      paths.stateFile,
      "# State\n\n## Recent session summaries\n\nNone yet.\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes the rendered session summaries back to state.md", async () => {
    await updateStateMdRecentSessionSummaries(paths, [
      {
        sessionId: "sess-kid-1",
        role: "kid",
        firstAt: "2026-04-23T10:00:00.000Z",
        lastAt: "2026-04-23T10:05:00.000Z",
        turnCount: 2,
        totalDurationMs: 30_000,
      },
    ]);
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("kid session");
    expect(updated).toContain("2 turns");
    expect(updated).not.toContain("None yet.");
  });
});

describe("updateStateMdFlags", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-state-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
    await writeFile(paths.stateFile, "# State\n\n## Flagged messages\n\nNone yet.\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes the rendered flag list back to state.md", async () => {
    await updateStateMdFlags(paths, [makeFlag()]);
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("Bit said: lol just write it for you");
    expect(updated).not.toContain("None yet.");
  });

  it("creates a flagged-messages section if state.md lacks one", async () => {
    await writeFile(paths.stateFile, "# State\n\n## Profile\n\nName: Ada\n", "utf8");
    await updateStateMdFlags(paths, [makeFlag()]);
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("## Profile");
    expect(updated).toContain("## Flagged messages");
    expect(updated).toContain("Reason: do not write it without teaching");
  });
});

describe("renderVoicePreferencesSection", () => {
  it("falls back to the placeholder when nothing is set", () => {
    expect(renderVoicePreferencesSection({})).toBe(
      "Not set yet. Bit will learn from early sessions.",
    );
  });

  it("renders session target and voice notes as bullets", () => {
    const body = renderVoicePreferencesSection({
      sessionTargetMinutes: 25,
      voicePreferences: "gentle, loves dinosaurs",
    });
    expect(body).toContain("- Target session length: 25 minutes");
    expect(body).toContain("- Voice notes: gentle, loves dinosaurs");
  });

  it("one-lines multi-line voice notes", () => {
    const body = renderVoicePreferencesSection({
      voicePreferences: "enthusiastic\n\nloves puns",
    });
    expect(body).toBe("- Voice notes: enthusiastic loves puns");
  });

  it("omits empty voice notes", () => {
    const body = renderVoicePreferencesSection({
      sessionTargetMinutes: 15,
      voicePreferences: "   ",
    });
    expect(body).toBe("- Target session length: 15 minutes");
  });
});

describe("applyVoicePreferencesToStateMd", () => {
  const seeded = `# State

## Voice preferences

Not set yet. Bit will learn from early sessions.

## Current dream

None selected yet.
`;

  it("replaces the voice preferences section in place", () => {
    const out = applyVoicePreferencesToStateMd(seeded, {
      sessionTargetMinutes: 20,
      voicePreferences: "bubbly",
    });
    expect(out).toContain("## Voice preferences\n\n- Target session length: 20 minutes");
    expect(out).toContain("- Voice notes: bubbly");
    expect(out).toContain("## Current dream");
    expect(out).not.toContain("Not set yet");
  });

  it("restores the placeholder when all fields are cleared", () => {
    const full = applyVoicePreferencesToStateMd(seeded, { sessionTargetMinutes: 25 });
    const cleared = applyVoicePreferencesToStateMd(full, {});
    expect(cleared).toContain("Not set yet. Bit will learn from early sessions.");
  });

  it("appends a voice preferences section when none exists", () => {
    const stateMd = "# State\n\n## Profile\n\nName: Ada\n";
    const out = applyVoicePreferencesToStateMd(stateMd, { sessionTargetMinutes: 20 });
    expect(out).toContain("## Profile");
    expect(out).toContain("## Voice preferences\n\n- Target session length: 20 minutes");
  });

  it("is idempotent when applied twice with the same input", () => {
    const once = applyVoicePreferencesToStateMd(seeded, {
      sessionTargetMinutes: 20,
      voicePreferences: "bubbly",
    });
    const twice = applyVoicePreferencesToStateMd(once, {
      sessionTargetMinutes: 20,
      voicePreferences: "bubbly",
    });
    expect(twice).toBe(once);
  });
});

describe("updateStateMdVoicePreferences", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-state-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
    await writeFile(
      paths.stateFile,
      "# State\n\n## Voice preferences\n\nNot set yet. Bit will learn from early sessions.\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes a voice preferences update back to disk", async () => {
    await updateStateMdVoicePreferences(paths, {
      sessionTargetMinutes: 30,
      voicePreferences: "enthusiastic",
    });
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("- Target session length: 30 minutes");
    expect(updated).toContain("- Voice notes: enthusiastic");
    expect(updated).not.toContain("Not set yet");
  });
});

describe("renderParentNotesSection", () => {
  it("returns 'None.' when notes are undefined", () => {
    expect(renderParentNotesSection(undefined)).toBe("None.");
  });

  it("returns 'None.' when notes are null", () => {
    expect(renderParentNotesSection(null)).toBe("None.");
  });

  it("returns 'None.' when notes are blank whitespace", () => {
    expect(renderParentNotesSection("   \n  ")).toBe("None.");
  });

  it("returns the trimmed notes text verbatim", () => {
    expect(renderParentNotesSection("  loves dinosaurs, shy about CSS  ")).toBe(
      "loves dinosaurs, shy about CSS",
    );
  });

  it("preserves multi-line notes for readability", () => {
    const notes = "Gets frustrated fast.\nLoves silly praise.";
    expect(renderParentNotesSection(notes)).toBe(notes);
  });
});

describe("applyParentNotesToStateMd", () => {
  const seeded = `# State

## Parent notes

None.

## Current dream

None selected yet.
`;

  it("replaces the parent notes section in place", () => {
    const out = applyParentNotesToStateMd(seeded, "Loves cats, avoids boss battles.");
    expect(out).toContain("## Parent notes\n\nLoves cats, avoids boss battles.");
    expect(out).toContain("## Current dream");
    expect(out).not.toContain("\n\nNone.\n");
  });

  it("restores 'None.' when notes are cleared to null", () => {
    const full = applyParentNotesToStateMd(seeded, "Once had notes.");
    const cleared = applyParentNotesToStateMd(full, null);
    expect(cleared).toContain("## Parent notes\n\nNone.");
    expect(cleared).not.toContain("Once had notes.");
  });

  it("appends a parent notes section when none exists", () => {
    const stateMd = "# State\n\n## Profile\n\nName: Ada\n";
    const out = applyParentNotesToStateMd(stateMd, "Loves painting.");
    expect(out).toContain("## Profile");
    expect(out).toContain("## Parent notes\n\nLoves painting.");
  });

  it("is idempotent when applied twice with the same input", () => {
    const once = applyParentNotesToStateMd(seeded, "Loves painting.");
    const twice = applyParentNotesToStateMd(once, "Loves painting.");
    expect(twice).toBe(once);
  });

  it("preserves sections that come before and after", () => {
    const original = [
      "# State",
      "",
      "## Profile",
      "",
      "Name: Ada",
      "",
      "## Parent notes",
      "",
      "None.",
      "",
      "## Flagged messages",
      "",
      "None yet.",
      "",
    ].join("\n");
    const out = applyParentNotesToStateMd(original, "Loves dinosaurs.");
    expect(out).toContain("Name: Ada");
    expect(out).toContain("## Parent notes\n\nLoves dinosaurs.");
    expect(out).toContain("## Flagged messages\n\nNone yet.");
  });
});

describe("updateStateMdParentNotes", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-state-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
    await writeFile(paths.stateFile, "# State\n\n## Parent notes\n\nNone.\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes a parent notes update back to disk", async () => {
    await updateStateMdParentNotes(paths, "Loves drawing, shy about typing.");
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("## Parent notes\n\nLoves drawing, shy about typing.");
    expect(updated).not.toContain("\n\nNone.\n");
  });
});

describe("computeCurrentSession", () => {
  it("returns null for no entries", () => {
    expect(computeCurrentSession([], { role: "kid", now: Date.now() })).toBeNull();
  });

  it("returns null when the last matching entry is outside the idle gap from now", () => {
    const session = computeCurrentSession([makeEntry({ timestamp: "2026-04-23T10:00:00.000Z" })], {
      role: "kid",
      now: Date.parse("2026-04-23T11:00:00.000Z"),
    });
    expect(session).toBeNull();
  });

  it("returns a one-turn session when the only entry is within the idle gap", () => {
    const now = Date.parse("2026-04-23T10:10:00.000Z");
    const session = computeCurrentSession(
      [makeEntry({ timestamp: "2026-04-23T10:00:00.000Z", durationMs: 5_000 })],
      { role: "kid", now },
    );
    expect(session).not.toBeNull();
    expect(session?.turnCount).toBe(1);
    expect(session?.startedAt).toBe("2026-04-23T10:00:00.000Z");
    expect(session?.elapsedMs).toBe(10 * 60 * 1000);
  });

  it("groups consecutive entries within the idle gap into one current sitting", () => {
    const now = Date.parse("2026-04-23T10:20:00.000Z");
    const session = computeCurrentSession(
      [
        makeEntry({ timestamp: "2026-04-23T10:00:00.000Z" }),
        makeEntry({ timestamp: "2026-04-23T10:05:00.000Z" }),
        makeEntry({ timestamp: "2026-04-23T10:10:00.000Z" }),
      ],
      { role: "kid", now },
    );
    expect(session).not.toBeNull();
    expect(session?.turnCount).toBe(3);
    expect(session?.startedAt).toBe("2026-04-23T10:00:00.000Z");
    expect(session?.lastAt).toBe("2026-04-23T10:10:00.000Z");
  });

  it("starts a fresh sitting after an idle gap larger than the threshold", () => {
    const now = Date.parse("2026-04-23T14:10:00.000Z");
    const session = computeCurrentSession(
      [
        makeEntry({ timestamp: "2026-04-23T10:00:00.000Z" }),
        makeEntry({ timestamp: "2026-04-23T10:05:00.000Z" }),
        makeEntry({ timestamp: "2026-04-23T14:00:00.000Z" }),
        makeEntry({ timestamp: "2026-04-23T14:05:00.000Z" }),
      ],
      { role: "kid", now },
    );
    expect(session?.turnCount).toBe(2);
    expect(session?.startedAt).toBe("2026-04-23T14:00:00.000Z");
    expect(session?.lastAt).toBe("2026-04-23T14:05:00.000Z");
  });

  it("filters by role so parent turns do not leak into the kid session", () => {
    const now = Date.parse("2026-04-23T10:20:00.000Z");
    const entries = [
      makeEntry({
        role: "parent",
        sessionId: "sess-parent-1",
        timestamp: "2026-04-23T10:10:00.000Z",
      }),
      makeEntry({ timestamp: "2026-04-23T10:00:00.000Z" }),
    ];
    const kid = computeCurrentSession(entries, { role: "kid", now });
    const parent = computeCurrentSession(entries, { role: "parent", now });
    expect(kid?.turnCount).toBe(1);
    expect(kid?.startedAt).toBe("2026-04-23T10:00:00.000Z");
    expect(parent?.turnCount).toBe(1);
    expect(parent?.startedAt).toBe("2026-04-23T10:10:00.000Z");
  });

  it("respects an overridden idleGapMs", () => {
    const now = Date.parse("2026-04-23T10:15:00.000Z");
    const entries = [
      makeEntry({ timestamp: "2026-04-23T10:00:00.000Z" }),
      makeEntry({ timestamp: "2026-04-23T10:10:00.000Z" }),
    ];
    const tight = computeCurrentSession(entries, { role: "kid", now, idleGapMs: 5 * 60_000 });
    expect(tight?.turnCount).toBe(1);
    expect(tight?.startedAt).toBe("2026-04-23T10:10:00.000Z");
  });
});

describe("renderCurrentSessionSection", () => {
  it("returns 'No active session right now.' when the session is null", () => {
    expect(renderCurrentSessionSection(null, 20)).toBe("No active session right now.");
  });

  it("renders bullets with started / target / elapsed / status", () => {
    const body = renderCurrentSessionSection(
      {
        startedAt: "2026-04-23T10:00:00.000Z",
        lastAt: "2026-04-23T10:05:00.000Z",
        turnCount: 3,
        elapsedMs: 5 * 60_000,
      },
      20,
    );
    expect(body).toContain("- Started: 2026-04-23T10:00:00.000Z");
    expect(body).toContain("- Target: 20 minutes");
    expect(body).toContain("- Elapsed: 5 minutes (3 turns so far)");
    expect(body).toContain("under target");
  });

  it("flags near-target status when elapsed is 80%+ of target", () => {
    const body = renderCurrentSessionSection(
      {
        startedAt: "2026-04-23T10:00:00.000Z",
        lastAt: "2026-04-23T10:17:00.000Z",
        turnCount: 4,
        elapsedMs: 17 * 60_000,
      },
      20,
    );
    expect(body).toContain("near target - start looking for a natural stop");
  });

  it("flags over-target status when elapsed has passed the target", () => {
    const body = renderCurrentSessionSection(
      {
        startedAt: "2026-04-23T10:00:00.000Z",
        lastAt: "2026-04-23T10:25:00.000Z",
        turnCount: 6,
        elapsedMs: 25 * 60_000,
      },
      20,
    );
    expect(body).toContain("over target - wrap up at the next clean moment");
  });

  it("uses singular turn when the sitting is one turn", () => {
    const body = renderCurrentSessionSection(
      {
        startedAt: "2026-04-23T10:00:00.000Z",
        lastAt: "2026-04-23T10:00:00.000Z",
        turnCount: 1,
        elapsedMs: 60_000,
      },
      20,
    );
    expect(body).toContain("1 turn so far");
    expect(body).not.toContain("1 turns so far");
  });
});

describe("applyCurrentSessionToStateMd", () => {
  const seeded = `# State

## Current dream

None selected yet.

## Current session

No active session right now.

## Recent session summaries

None yet.
`;

  const active = {
    startedAt: "2026-04-23T10:00:00.000Z",
    lastAt: "2026-04-23T10:08:00.000Z",
    turnCount: 2,
    elapsedMs: 8 * 60_000,
  };

  it("replaces the current session section in place", () => {
    const out = applyCurrentSessionToStateMd(seeded, active, 20);
    expect(out).toContain("## Current session\n\n- Started: 2026-04-23T10:00:00.000Z");
    expect(out).toContain("## Current dream");
    expect(out).toContain("## Recent session summaries");
    expect(out).not.toContain("No active session right now.");
  });

  it("restores the placeholder when the session becomes null", () => {
    const running = applyCurrentSessionToStateMd(seeded, active, 20);
    const cleared = applyCurrentSessionToStateMd(running, null, 20);
    expect(cleared).toContain("No active session right now.");
    expect(cleared).not.toContain("- Started: 2026-04-23T10:00:00.000Z");
  });

  it("appends a current session section when the file lacks one", () => {
    const stateMd = "# State\n\n## Profile\n\nName: Ada\n";
    const out = applyCurrentSessionToStateMd(stateMd, active, 20);
    expect(out).toContain("## Profile");
    expect(out).toContain("## Current session\n\n- Started: 2026-04-23T10:00:00.000Z");
  });

  it("is idempotent when applied twice with the same session", () => {
    const once = applyCurrentSessionToStateMd(seeded, active, 20);
    const twice = applyCurrentSessionToStateMd(once, active, 20);
    expect(twice).toBe(once);
  });
});

describe("updateStateMdCurrentSession", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-current-session-state-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
    await writeFile(
      paths.stateFile,
      "# State\n\n## Current session\n\nNo active session right now.\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes the rendered current session back to state.md", async () => {
    await updateStateMdCurrentSession(
      paths,
      {
        startedAt: "2026-04-23T10:00:00.000Z",
        lastAt: "2026-04-23T10:05:00.000Z",
        turnCount: 3,
        elapsedMs: 5 * 60_000,
      },
      20,
    );
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("- Started: 2026-04-23T10:00:00.000Z");
    expect(updated).toContain("- Target: 20 minutes");
    expect(updated).toContain("3 turns so far");
    expect(updated).not.toContain("No active session right now.");
  });
});

describe("renderProfileSection", () => {
  it("renders name, age, and a comma-joined interests line", () => {
    expect(renderProfileSection({ name: "Ada", age: 9, interests: ["cats", "space"] })).toBe(
      "- Name: Ada\n- Age: 9\n- Interests: cats, space",
    );
  });

  it("falls back to 'not set yet' when interests are empty", () => {
    expect(renderProfileSection({ name: "Ada", age: 9, interests: [] })).toBe(
      "- Name: Ada\n- Age: 9\n- Interests: not set yet",
    );
  });
});

describe("applyProfileSectionToStateMd", () => {
  const seeded = `# State

## Profile

- Name: Ada
- Age: 9
- Interests: cats

## Parent notes

None.
`;

  it("replaces the profile section in place", () => {
    const out = applyProfileSectionToStateMd(seeded, {
      name: "Ada",
      age: 9,
      interests: ["cats", "space"],
    });
    expect(out).toContain("## Profile\n\n- Name: Ada\n- Age: 9\n- Interests: cats, space");
    expect(out).toContain("## Parent notes");
  });

  it("renders the 'not set yet' fallback when interests are cleared", () => {
    const out = applyProfileSectionToStateMd(seeded, { name: "Ada", age: 9, interests: [] });
    expect(out).toContain("- Interests: not set yet");
  });

  it("appends a profile section when none exists", () => {
    const stateMd = "# State\n\n## Parent notes\n\nNone.\n";
    const out = applyProfileSectionToStateMd(stateMd, {
      name: "Ada",
      age: 9,
      interests: ["cats"],
    });
    expect(out).toContain("## Profile\n\n- Name: Ada\n- Age: 9\n- Interests: cats");
    expect(out).toContain("## Parent notes");
  });

  it("is idempotent when applied twice with the same input", () => {
    const once = applyProfileSectionToStateMd(seeded, {
      name: "Ada",
      age: 9,
      interests: ["dinosaurs"],
    });
    const twice = applyProfileSectionToStateMd(once, {
      name: "Ada",
      age: 9,
      interests: ["dinosaurs"],
    });
    expect(twice).toBe(once);
  });

  it("preserves sections that come before and after", () => {
    const original = [
      "# State",
      "",
      "## Profile",
      "",
      "- Name: Ada",
      "- Age: 9",
      "- Interests: cats",
      "",
      "## Parent notes",
      "",
      "Loves colors.",
      "",
      "## Flagged messages",
      "",
      "None yet.",
      "",
    ].join("\n");
    const out = applyProfileSectionToStateMd(original, {
      name: "Ada",
      age: 9,
      interests: ["dinosaurs"],
    });
    expect(out).toContain("- Interests: dinosaurs");
    expect(out).toContain("## Parent notes\n\nLoves colors.");
    expect(out).toContain("## Flagged messages\n\nNone yet.");
  });
});

describe("updateStateMdProfile", () => {
  let root: string;
  let paths: ReturnType<typeof profilePathsFor>;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hi-bit-state-"));
    const layout = await bootstrapLayout(root);
    paths = profilePathsFor(layout, "ada");
    await bootstrapProfileDirs(paths);
    await writeFile(
      paths.stateFile,
      "# State\n\n## Profile\n\n- Name: Ada\n- Age: 9\n- Interests: cats\n",
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("writes a profile update back to disk", async () => {
    await updateStateMdProfile(paths, {
      name: "Ada",
      age: 9,
      interests: ["dinosaurs", "painting"],
    });
    const updated = await readFile(paths.stateFile, "utf8");
    expect(updated).toContain("- Interests: dinosaurs, painting");
    expect(updated).not.toContain("- Interests: cats");
  });
});
