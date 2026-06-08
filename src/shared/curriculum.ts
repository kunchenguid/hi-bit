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
 * kid's Factory Handbook and the grown-up progress window). It does not drive
 * chrome labels and it does not gate Bit's vocabulary - the canon words live in
 * `concepts.ts`.
 *
 * Design decisions baked in here (from the reviewed design):
 * - Mastery is a four-state gradient, not a boolean: coverage is not learning.
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

/** A skill's mastery gradient. Only `fluent` advances the kid up the ramp. */
export type MasteryState = "unseen" | "met" | "grasped" | "fluent";

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
  /** The agentic-engineering skill underneath (used in the grown-up window). */
  realSkill: string;
  /**
   * Skills that must be at least `grasped` before this one can be coached or
   * started. The minimal DAG: empty for all but `parallel-bots`.
   */
  requires: SkillId[];
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
  },
  {
    id: "iterate-feedback",
    arc: "direct",
    order: 2,
    kidLabel: "Give feedback to make a creation better",
    realSkill: "The iteration loop",
    requires: [],
  },
  {
    id: "specific-feedback",
    arc: "direct",
    order: 3,
    kidLabel: "Say exactly what you want changed, not just “it’s bad”",
    realSkill: "Precise specification - the core skill",
    requires: [],
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
  },
  {
    id: "give-picture",
    arc: "context",
    order: 6,
    kidLabel: "Give Bit a picture to work from",
    realSkill: "Multimodal context & references",
    requires: [],
  },
  {
    id: "browse-creation",
    arc: "context",
    order: 7,
    kidLabel: "Open a creation and play with it",
    realSkill: "Observing the artifact to steer it",
    requires: [],
  },
  {
    id: "async-productive",
    arc: "orchestrate",
    order: 8,
    kidLabel: "Keep going while a bot works in the background",
    realSkill: "Async delegation - staying productive",
    requires: [],
  },
  {
    id: "decompose",
    arc: "orchestrate",
    order: 9,
    kidLabel: "Break a big idea into smaller steps",
    realSkill: "Decomposition",
    requires: [],
  },
  {
    id: "dependency-reasoning",
    arc: "orchestrate",
    order: 10,
    kidLabel: "Know what can happen now and what has to wait",
    realSkill: "Dependency reasoning / scheduling",
    requires: [],
  },
  {
    id: "parallel-bots",
    arc: "orchestrate",
    order: 11,
    kidLabel: "Have bots build a few things at once",
    realSkill: "Parallel orchestration",
    requires: ["ask-creation", "iterate-feedback"],
  },
  {
    id: "switch-tabs",
    arc: "orchestrate",
    order: 12,
    kidLabel: "Switch between creations with tabs",
    realSkill: "Context-switching across parallel work",
    requires: [],
  },
  {
    id: "oversee",
    arc: "oversee",
    order: 13,
    kidLabel: "Check the Factory and the Logbook",
    realSkill: "Observability / tracing agent work",
    requires: [],
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
export const MASTERY_ORDER: readonly MasteryState[] = ["unseen", "met", "grasped", "fluent"];

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
 * What Bit observed about a skill this turn. `met` is the situation arising;
 * `demonstrated` is the kid actually doing it; `unprompted` is doing it without
 * Bit asking - the signal that it has become a habit.
 */
export type SkillSignal = {
  met?: boolean;
  demonstrated?: boolean;
  unprompted?: boolean;
};

/**
 * The mastery transition. Monotonic - mastery never regresses.
 * unseen -> met (situation arises) -> grasped (did it once) -> fluent (did it
 * unprompted, after having grasped it). A first demonstration jumps straight to
 * grasped even from unseen, but fluency is only earned once the kid does it
 * unprompted *after* already grasping it - a single first-ever unprompted try
 * lands at grasped, never straight to fluent.
 */
export function advanceMastery(current: MasteryState, signal: SkillSignal): MasteryState {
  let next = current;
  if (signal.met && next === "unseen") next = "met";
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
 * The single skill Bit should coach right now: the lowest-order skill that is
 * relevant to what is happening, whose prerequisites are met, and which is not
 * already fluent. `relevant` is the set of skills the current situation touches.
 */
export function nextSkillToCoach(map: MasteryMap, relevant: SkillId[]): SkillId | null {
  const relevantSet = new Set(relevant);
  const candidate = SKILLS.filter((skill) => relevantSet.has(skill.id))
    .filter((skill) => masteryOf(map, skill.id) !== "fluent")
    .filter((skill) => prerequisitesMet(map, skill.id))
    .sort((a, b) => a.order - b.order)[0];
  return candidate?.id ?? null;
}

/**
 * The frontier of skills worth coaching next: skills not yet fluent whose
 * prerequisites are met, lowest order first. Bit picks at most one of these to
 * coach in any turn, and only when a build actually calls for it.
 */
export function coachableSkills(map: MasteryMap): SkillDef[] {
  return SKILLS.filter((skill) => masteryOf(map, skill.id) !== "fluent")
    .filter((skill) => prerequisitesMet(map, skill.id))
    .sort((a, b) => a.order - b.order);
}

/**
 * The per-turn coaching note appended to Bit's prompt. It tells Bit where the
 * builder is on the ramp and which skills are next, and asks Bit to record the
 * builder's progress so mastery advances. It deliberately does not prescribe a
 * single skill - Bit judges, from the conversation, what the moment calls for.
 */
export function buildCoachingNote(map: MasteryMap): string {
  const frontier = coachableSkills(map).slice(0, 3);
  const reach = reachableTier(map);
  const lines = [`Builder's reach: build tier ${reach} of ${BUILD_TIERS.length}.`];
  if (frontier.length > 0) {
    const list = frontier.map((skill) => `${skill.id} (${skill.realSkill})`).join("; ");
    lines.push(`Skills to grow next - coach at most one, only when a build calls for it: ${list}.`);
  } else {
    lines.push("This builder is fluent across the whole spine - follow their lead.");
  }
  if (canRunParallel(map)) {
    lines.push(
      "Parallel work is fine: when the builder asks for several things, start the independent ones together and say plainly when one must wait for another.",
    );
  } else {
    lines.push(
      "Readiness gate: this builder is still learning to steer one build at a time, so do NOT start several builds at once. If they ask for a lot, start the most exciting one, do it well, and park the rest with park_ambition.",
    );
  }
  lines.push(
    "When the builder shows a skill, call record_progress with that skill and whether they did it unprompted. The first time they do something without being asked, name it warmly - tie the play-word to the real engineering idea once.",
  );
  return lines.join("\n");
}

export type SkillProgress = SkillDef & { mastery: MasteryState };

/** Every skill stamped with its current mastery - the basis for both reflection surfaces. */
export function skillProgress(map: MasteryMap): SkillProgress[] {
  return SKILLS.map((skill) => ({ ...skill, mastery: masteryOf(map, skill.id) }));
}
