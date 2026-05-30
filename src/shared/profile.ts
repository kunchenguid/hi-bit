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

/**
 * Raw facts that drive the progressive vocabulary unlock ladder (see
 * `shared/concepts.ts`). `creationCount` is not stored here - it is derived from
 * the kid's portfolio on the fly.
 */
export type UnlockStats = {
  /** How many builds the kid has ever set off (creating or changing a creation). */
  buildsDelegated: number;
  /** Whether the kid has opened "See all activities" at least once. */
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
};

export type ProfileRecord = ProfileSummary;

export const EMPTY_UNLOCK_STATS: UnlockStats = { buildsDelegated: 0, openedActivities: false };
