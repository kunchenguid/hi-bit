/**
 * Progressive vocabulary unlock ladder.
 *
 * The factory world is real in the code, and the chrome always names it with the
 * real in-world words. The ladder governs one thing only: Bit's own chat. A
 * 7-year-old never hears Bit proactively bring up an inside word before they
 * have done the thing it names; the word becomes sayable for Bit the moment it
 * becomes real, and Bit says it once warmly. Tier 0 words (Bit, build, creation,
 * Play) are always sayable and are not tracked here - everything above unlocks
 * from what the kid has actually done.
 *
 * This module is pure data + pure functions, consumed by the main process to
 * unlock concepts and gate Bit's vocabulary. It does not drive chrome labels.
 */

/**
 * The canon words Bit may warmly reveal in chat. This is deliberately a small
 * subset of the factory canon: words that name something the kid directly does
 * and sees early. The deeper mechanism words (blueprint, machines, assembly
 * line, save points, workbench) are taught through the curriculum (see
 * `curriculum.ts`) and shown in chrome, not revealed by this ladder - so they
 * are not here. `blueprint` is expected to return once the curriculum earns it
 * back.
 */
export type ConceptId = "bot" | "factory" | "logbook";

/** What the kid did that makes a concept real. Declarative so it stays testable. */
export type ConceptTrigger =
  | { fact: "buildsDelegated"; atLeast: number }
  | { fact: "creationCount"; atLeast: number }
  | { fact: "openedActivities" };

export type ConceptDef = {
  id: ConceptId;
  tier: number;
  /** The kid-facing word Bit reveals and the chrome shows. */
  word: string;
  /** One warm hint Bit folds in the first time it says the word. */
  gloss: string;
  trigger: ConceptTrigger;
};

/** Words the kid sees from day one: always usable, never "unlocked". */
export const BASE_WORDS = ["Bit", "build", "creation", "Play"] as const;

/** The ladder, in unlock order. Tier drives pacing; the array order breaks ties. */
export const CONCEPT_LADDER: readonly ConceptDef[] = [
  {
    id: "bot",
    tier: 1,
    word: "bot",
    gloss: "a little maker that builds things for you in the background",
    trigger: { fact: "buildsDelegated", atLeast: 1 },
  },
  {
    id: "factory",
    tier: 2,
    word: "factory",
    gloss: "the place all your creations live together and get built",
    trigger: { fact: "creationCount", atLeast: 2 },
  },
  {
    id: "logbook",
    tier: 3,
    word: "Logbook",
    gloss: "the list of every step we took on a creation",
    trigger: { fact: "openedActivities" },
  },
];

/** Whether a stored id still maps to a ladder concept (drops retired ids like the old "workshop"). */
export function isKnownConceptId(id: string): id is ConceptId {
  return CONCEPT_LADDER.some((concept) => concept.id === id);
}

/** One unlocked concept, stamped when its trigger first fired. */
export type UnlockedConcept = { id: ConceptId; firstSeenAt: string };

/** The facts a kid's unlocks are derived from. */
export type UnlockFacts = {
  /** How many builds the kid has ever set off (creating or changing a creation). */
  buildsDelegated: number;
  /** How many creations the kid currently has. */
  creationCount: number;
  /** Whether the kid has opened the Logbook at least once. */
  openedActivities: boolean;
};

export function conceptById(id: ConceptId): ConceptDef {
  const def = CONCEPT_LADDER.find((concept) => concept.id === id);
  if (!def) throw new Error(`Unknown concept: ${id}`);
  return def;
}

function triggerMet(trigger: ConceptTrigger, facts: UnlockFacts): boolean {
  switch (trigger.fact) {
    case "buildsDelegated":
      return facts.buildsDelegated >= trigger.atLeast;
    case "creationCount":
      return facts.creationCount >= trigger.atLeast;
    case "openedActivities":
      return facts.openedActivities;
  }
}

/** Concept ids whose trigger the kid has satisfied, in ladder order. */
export function eligibleConceptIds(facts: UnlockFacts): ConceptId[] {
  return CONCEPT_LADDER.filter((concept) => triggerMet(concept.trigger, facts)).map(
    (concept) => concept.id,
  );
}

/**
 * The single next concept to unlock, honoring the pacing guard of at most one
 * new word per turn. Returns the earliest-ladder eligible concept the kid has
 * not unlocked yet, or null when nothing new is due.
 */
export function nextConceptToUnlock(facts: UnlockFacts, unlocked: ConceptId[]): ConceptId | null {
  const have = new Set(unlocked);
  for (const id of eligibleConceptIds(facts)) {
    if (!have.has(id)) return id;
  }
  return null;
}

/** All inside words Bit may currently use: base words plus unlocked concept words, in ladder order. */
export function allowedWords(unlocked: ConceptId[]): string[] {
  const have = new Set(unlocked);
  const unlockedWords = CONCEPT_LADDER.filter((concept) => have.has(concept.id)).map(
    (concept) => concept.word,
  );
  return [...BASE_WORDS, ...unlockedWords];
}

/**
 * The "Words you may use" note appended to every Bit turn. `unlocked` is the
 * full set after this turn's unlock (if any); `newlyUnlocked` is the one concept
 * Bit should introduce warmly this message, or null when nothing new unlocked.
 */
export function buildVocabularyNote(
  unlocked: ConceptId[],
  pendingReveal: ConceptId | null,
  newlyUnlocked: ConceptId | null = pendingReveal,
): string {
  const allowed =
    pendingReveal && !unlocked.includes(pendingReveal) ? [...unlocked, pendingReveal] : unlocked;
  const lines = [`Words you may use: ${allowedWords(allowed).join(", ")}.`];
  if (pendingReveal) {
    const def = conceptById(pendingReveal);
    const label = newlyUnlocked === pendingReveal ? "Newly unlocked" : "Unlocked but not revealed";
    lines.push(
      `${label} - "${def.word}" (${def.gloss}). Say it warmly and naturally exactly once this message, then keep going.`,
    );
  }
  return lines.join("\n");
}
