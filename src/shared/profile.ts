export type ProfileInput = {
  name: string;
  age: number;
  interests?: readonly string[];
  notes?: string;
};

export type ProfileSettingsInput = {
  name?: string;
  age?: number;
  interests?: readonly string[] | null;
  notes?: string | null;
};

import type { UnlockedConcept } from "./concepts";
import type { MasteryMap } from "./curriculum";

/**
 * A parked ambition. When a kid asks for something bigger than they can take on
 * right now, Bit slices it to the next step and parks the rest here so nothing
 * is lost and the dream stays visible (the "Yes, and here's the first step"
 * pattern). `started` means a creation has been kicked off for it.
 */
export type RoadmapStatus = "parked" | "started" | "done";

export type RoadmapItem = {
  id: string;
  title: string;
  note?: string;
  status: RoadmapStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * Raw facts that drive the progressive vocabulary unlock ladder (see
 * `shared/concepts.ts`). `creationCount` is not stored here - it is derived from
 * the kid's portfolio on the fly.
 */
export type UnlockStats = {
  /** How many builds the kid has ever set off (creating or changing a creation). */
  buildsDelegated: number;
  /** Whether the kid has opened the Logbook at least once. */
  openedActivities: boolean;
};

export type ProfileSummary = {
  schemaVersion: 1;
  id: string;
  name: string;
  age: number;
  interests: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** Inside words this kid has unlocked, each stamped when its trigger first fired. */
  unlockedConcepts: UnlockedConcept[];
  pendingConceptReveals: UnlockedConcept[];
  /** Counters the unlock ladder reads from. */
  unlockStats: UnlockStats;
  /** Per-skill mastery in the agentic-engineering curriculum (see shared/curriculum.ts). */
  skillMastery: MasteryMap;
  /** Parked ambitions sliced off oversized asks; the kid's wishlist. */
  roadmap: RoadmapItem[];
};

export type ProfileRecord = ProfileSummary;

export const EMPTY_UNLOCK_STATS: UnlockStats = { buildsDelegated: 0, openedActivities: false };
