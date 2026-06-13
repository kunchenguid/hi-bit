/**
 * The agentic-engineering curriculum.
 *
 * Hi-Bit's promise is that every builder is becoming an agentic engineer: someone
 * who can imagine something and direct AI to build it, taking on bigger and bigger
 * creations over time. The way they learn is by building - the build demands a
 * skill, and Bit coaches that one skill just-in-time.
 *
 * This module is the spine of that curriculum: the concrete skills of operating
 * Bit and the bots productively, each tied to a real Hi-Bit feature and to the
 * agentic-engineering skill underneath. It is pure data + pure functions, consumed
 * by the main process (to coach and to gate) and surfaced to the renderer (the
 * kid's Factory Handbook and My progress). It does not drive
 * chrome labels and it does not gate Bit's vocabulary - the canon words live in
 * `concepts.ts`.
 *
 * Design decisions baked in here (from the reviewed design):
 * - Mastery is a three-state gradient, not a boolean: coverage is not learning.
 * - The spine is a *minimal* DAG: skills are learnable in any order and we encode
 *   a hard prerequisite only where one skill is genuinely impossible without
 *   another. There is exactly one: running bots in parallel needs the kid to be
 *   able to direct a single bot first.
 * - A complexity ramp derives the build tier a kid can comfortably take on from
 *   the skills they are fluent in.
 */

export type SkillId =
  | "ask-creation"
  | "iterate-feedback"
  | "specific-feedback"
  | "voice-input"
  | "show-screen"
  | "give-picture"
  | "browse-creation"
  | "async-productive"
  | "decompose"
  | "dependency-reasoning"
  | "parallel-bots"
  | "switch-tabs"
  | "oversee";

export type ArcId = "direct" | "context" | "orchestrate" | "oversee";

/**
 * A skill's mastery gradient. We only ever record what the builder actually
 * *did* (not "the situation came up"), so a skill goes unseen -> grasped (did it
 * with help) -> fluent (did it unprompted). Only `fluent` advances the ramp.
 */
export type MasteryState = "unseen" | "grasped" | "fluent";

export type ArcDef = {
  id: ArcId;
  /** Parent/code-facing arc name. */
  title: string;
  /** One line on what the arc is for. */
  blurb: string;
};

export type SkillDef = {
  id: SkillId;
  arc: ArcId;
  /** 1..13 - display order and tie-break for coaching. */
  order: number;
  /** What the kid actually does, in their world's words (used in the Handbook). */
  kidLabel: string;
  /**
   * The descriptor used in Bit's per-turn learning map. Defaults to `kidLabel`,
   * which is concrete enough for Bit to judge progress correctly. Only set where
   * the kidLabel names a gated inside-word (bot, factory, Logbook) that must not
   * leak into the prompt - then this is an inside-word-free rephrase.
   */
  coachLabel?: string;
  /** The agentic-engineering skill underneath (used in the grown-up window). */
  realSkill: string;
  /**
   * Skills that must be at least `grasped` before this one can be coached or
   * started. The minimal DAG: empty for all but `parallel-bots`.
   */
  requires: SkillId[];
  /**
   * An example of how this skill could be introduced to the builder - a concrete
   * next step Bit can draw on if it judges the moment is right. Surfaced in the
   * learning map as a suggestion menu, never as a system-chosen instruction; Bit
   * decides whether and when to use it and reworks it in its own warm words.
   * Optional: some skills (e.g. voice) depend on device support and are left to
   * Bit to surface only when it fits.
   */
  nudge?: string;
};

export const ARCS: readonly ArcDef[] = [
  { id: "direct", title: "Direct one agent", blurb: "Start work and steer one result." },
  { id: "context", title: "Give Bit context", blurb: "Show Bit what you mean." },
  {
    id: "orchestrate",
    title: "Orchestrate many",
    blurb: "Keep several builds moving at once - the keystone of agentic engineering.",
  },
  { id: "oversee", title: "Oversee the operation", blurb: "See every step that was taken." },
];

export const SKILLS: readonly SkillDef[] = [
  {
    id: "ask-creation",
    arc: "direct",
    order: 1,
    kidLabel: "Ask Bit for a new creation",
    realSkill: "Kicking off work / stating intent",
    requires: [],
    nudge:
      "If the builder is unsure what to make, offer two or three fun creation ideas to pick from.",
  },
  {
    id: "iterate-feedback",
    arc: "direct",
    order: 2,
    kidLabel: "Give feedback to make a creation better",
    realSkill: "The iteration loop",
    requires: [],
    nudge:
      "Once a creation is built, invite the builder to play it and tell you one thing to change or add.",
  },
  {
    id: "specific-feedback",
    arc: "direct",
    order: 3,
    kidLabel: "Say exactly what you want changed, not just “it’s bad”",
    realSkill: "Precise specification - the core skill",
    requires: [],
    nudge:
      "Help the builder name the exact change - the color, the spot, the size, the speed - instead of just “make it better”.",
  },
  {
    id: "voice-input",
    arc: "context",
    order: 4,
    kidLabel: "Talk to Bit with your voice",
    realSkill: "Natural-language input fluency",
    requires: [],
  },
  {
    id: "show-screen",
    arc: "context",
    order: 5,
    kidLabel: "Ask Bit to look at the screen",
    realSkill: "Grounding the agent in the current state",
    requires: [],
    nudge:
      "If the builder talks about how something looks, offer to take a look at their screen so you can help.",
  },
  {
    id: "give-picture",
    arc: "context",
    order: 6,
    kidLabel: "Give Bit a picture to work from",
    realSkill: "Multimodal context & references",
    requires: [],
    nudge:
      "If the builder wants a certain look, offer to match a picture they can show you (drawn, a photo, or one they find).",
  },
  {
    id: "browse-creation",
    arc: "context",
    order: 7,
    kidLabel: "Open a creation and play with it",
    realSkill: "Observing the artifact to steer it",
    requires: [],
    nudge:
      "When a creation is finished, invite the builder to press Play and try it out, then react to what happens together.",
  },
  {
    id: "async-productive",
    arc: "orchestrate",
    order: 8,
    kidLabel: "Keep going while a bot works in the background",
    coachLabel: "Keep going - chat or plan - while a build runs in the background",
    realSkill: "Async delegation - staying productive",
    requires: [],
    nudge:
      "While a build is running, suggest planning or starting the next piece so the wait is never just waiting.",
  },
  {
    id: "decompose",
    arc: "orchestrate",
    order: 9,
    kidLabel: "Break a big idea into smaller steps",
    realSkill: "Decomposition",
    requires: [],
    nudge:
      "Suggest one concrete next piece for this creation - a title screen, a score, a second level, a power-up - to grow it one step at a time.",
  },
  {
    id: "dependency-reasoning",
    arc: "orchestrate",
    order: 10,
    kidLabel: "Know what can happen now and what has to wait",
    realSkill: "Dependency reasoning / scheduling",
    requires: [],
    nudge:
      "When two pieces depend on each other, explain plainly which one has to come first and why.",
  },
  {
    id: "parallel-bots",
    arc: "orchestrate",
    order: 11,
    kidLabel: "Have bots build a few things at once",
    coachLabel: "Have a few things built at the same time",
    realSkill: "Parallel orchestration",
    requires: ["ask-creation", "iterate-feedback"],
    nudge:
      "Once the builder can steer one creation well, suggest building two different things at the same time.",
  },
  {
    id: "switch-tabs",
    arc: "orchestrate",
    order: 12,
    kidLabel: "Switch between creations with tabs",
    realSkill: "Context-switching across parallel work",
    requires: [],
    nudge:
      "When the builder has a few creations going, mention they can flip between them with the tabs.",
  },
  {
    id: "oversee",
    arc: "oversee",
    order: 13,
    kidLabel: "Check the Factory and the Logbook",
    coachLabel: "Look back over every step taken on a creation",
    realSkill: "Observability / tracing agent work",
    requires: [],
    nudge:
      "Offer to walk the builder through every step you took, so they can see how it all came together.",
  },
];

export function skillById(id: SkillId): SkillDef {
  const def = SKILLS.find((skill) => skill.id === id);
  if (!def) throw new Error(`Unknown skill: ${id}`);
  return def;
}

export function isSkillId(id: string): id is SkillId {
  return SKILLS.some((skill) => skill.id === id);
}

/** Mastery states from least to most learned. */
export const MASTERY_ORDER: readonly MasteryState[] = ["unseen", "grasped", "fluent"];

export function masteryRank(state: MasteryState): number {
  return MASTERY_ORDER.indexOf(state);
}

export function isMasteryState(value: unknown): value is MasteryState {
  return typeof value === "string" && (MASTERY_ORDER as readonly string[]).includes(value);
}

/**
 * Keeps only well-formed `{skill: state}` pairs - used when loading a profile
 * from disk so a stale or hand-edited file can never poison the curriculum.
 */
export function sanitizeMastery(value: unknown): MasteryMap {
  if (!value || typeof value !== "object") return {};
  const map: MasteryMap = {};
  for (const [key, state] of Object.entries(value as Record<string, unknown>)) {
    if (isSkillId(key) && isMasteryState(state)) map[key] = state;
  }
  return map;
}

/** Whether `state` is at least as learned as `min`. */
export function atLeast(state: MasteryState, min: MasteryState): boolean {
  return masteryRank(state) >= masteryRank(min);
}

/** A kid's mastery per skill. Absent skills are `unseen`. */
export type MasteryMap = Partial<Record<SkillId, MasteryState>>;

export function masteryOf(map: MasteryMap, id: SkillId): MasteryState {
  return map[id] ?? "unseen";
}

/**
 * What Bit observed the builder actually do with a skill this turn.
 * `demonstrated` is the kid doing it; `unprompted` is doing it without Bit
 * asking - the signal that it has become a habit. We deliberately do not track
 * "the situation came up": it is the noisiest signal and invites false records.
 */
export type SkillSignal = {
  demonstrated?: boolean;
  unprompted?: boolean;
};

/**
 * The mastery transition. Monotonic - mastery never regresses.
 * unseen -> grasped (did it, with help) -> fluent (did it unprompted, after
 * already grasping it). A first demonstration jumps straight to grasped; fluency
 * is only earned once the kid does it unprompted *after* grasping it, so a single
 * first-ever unprompted try lands at grasped, never straight to fluent.
 */
export function advanceMastery(current: MasteryState, signal: SkillSignal): MasteryState {
  let next = current;
  if (signal.demonstrated) {
    const alreadyGrasped = masteryRank(current) >= masteryRank("grasped");
    if (masteryRank(next) < masteryRank("grasped")) next = "grasped";
    if (alreadyGrasped && signal.unprompted) next = "fluent";
  }
  return next;
}

/** Whether every hard prerequisite of `id` is at least grasped. */
export function prerequisitesMet(map: MasteryMap, id: SkillId): boolean {
  return skillById(id).requires.every((req) => atLeast(masteryOf(map, req), "grasped"));
}

/**
 * The one hard readiness gate: Bit must not fan out bots in parallel for a kid
 * who cannot yet direct a single bot.
 */
export function canRunParallel(map: MasteryMap): boolean {
  return prerequisitesMet(map, "parallel-bots");
}

export type BuildTier = 1 | 2 | 3 | 4;

export type TierDef = {
  tier: BuildTier;
  /** Kid-facing description of the kind of creation this tier unlocks. */
  label: string;
  /** Skills that must be fluent (cumulatively with lower tiers) to reach this tier. */
  requires: SkillId[];
};

export const BUILD_TIERS: readonly TierDef[] = [
  { tier: 1, label: "One creation you ask for and steer", requires: ["ask-creation"] },
  {
    tier: 2,
    label: "A richer creation shaped by specific feedback",
    requires: ["iterate-feedback", "specific-feedback"],
  },
  {
    tier: 3,
    label: "A multi-part creation, with you staying busy while a bot builds",
    requires: ["decompose", "async-productive"],
  },
  {
    tier: 4,
    label: "Several creations at once, built in parallel",
    requires: ["dependency-reasoning", "parallel-bots"],
  },
];

/**
 * The complexity ramp: the highest build tier whose requirements - cumulatively
 * with every lower tier - are all fluent. Floors at tier 1.
 */
export function reachableTier(map: MasteryMap): BuildTier {
  let reached: BuildTier = 1;
  for (const tier of BUILD_TIERS) {
    const ready = tier.requires.every((id) => masteryOf(map, id) === "fluent");
    if (!ready) break;
    reached = tier.tier;
  }
  return reached;
}

/**
 * The per-turn learning map appended to Bit's prompt. We deliberately do NOT
 * pick a skill to teach - we surface the whole curriculum, where the builder is
 * on each skill, and an example of how each could be introduced, then let Bit
 * judge (from what the builder just did) whether and which one knowledge point
 * to weave in. The mastery ledger stays in code; the teaching decision is Bit's.
 *
 * Two derived facts are stated plainly because they are guardrails, not nudges:
 * the builder's current reach (the complexity ramp) and whether they are ready
 * to run builds in parallel yet.
 */
export function buildCoachingNote(map: MasteryMap): string {
  const reach = reachableTier(map);
  const reachLabel = BUILD_TIERS.find((tier) => tier.tier === reach)?.label ?? "";
  const lines = [
    "Builder's learning map - where they are in learning to direct you and background builds, and an example of how each skill could be introduced. You teach only by building: when something the builder just did opens the door, you MAY warmly weave in ONE skill they have not mastered yet (tie the everyday thing to the real idea), or none at all. You decide which and when - never force it, at most one new idea per message, never a lesson.",
    `Reach right now: build tier ${reach} of ${BUILD_TIERS.length} (${reachLabel}).`,
  ];
  // Each skill is named by the concrete thing the builder does (coachLabel, which
  // falls back to the kid label) plus its engineering meaning, so Bit can judge
  // record_progress accurately. coachLabel keeps the gated inside words (bot,
  // factory, Logbook) out of the prompt; Bit's own output stays gated by the
  // "Words you may use" note.
  for (const arc of ARCS) {
    lines.push(`${arc.title}:`);
    for (const skill of SKILLS.filter((candidate) => candidate.arc === arc.id)) {
      const mastery = masteryOf(map, skill.id);
      const label = skill.coachLabel ?? skill.kidLabel;
      const example = mastery !== "fluent" && skill.nudge ? ` · to introduce: ${skill.nudge}` : "";
      lines.push(`  - [${mastery}] ${label} (${skill.realSkill})${example}`);
    }
  }
  if (canRunParallel(map)) {
    lines.push(
      "Parallel building is open: when they ask for several things, start the independent ones together and say plainly when one must wait for another.",
    );
  } else {
    lines.push(
      "Parallel building is not open yet: do NOT start several builds at once. If they ask for a lot, start the most exciting one, do it well, and park the rest with park_ambition.",
    );
  }
  lines.push(
    "Whenever the builder shows a skill, call record_progress for it (mark unprompted when they did it without you asking); the first unprompted time, name it warmly. Never tell them you are tracking anything.",
  );
  return lines.join("\n");
}

export type SkillProgress = SkillDef & { mastery: MasteryState };

/** Every skill stamped with its current mastery - the basis for both reflection surfaces. */
export function skillProgress(map: MasteryMap): SkillProgress[] {
  return SKILLS.map((skill) => ({ ...skill, mastery: masteryOf(map, skill.id) }));
}
