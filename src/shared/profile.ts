export type HarnessSessionIds = {
  kid: string;
  parent: string;
};

export type Profile = {
  id: string;
  name: string;
  age: number;
  interests: string[];
  notes?: string;
  sessions: HarnessSessionIds;
  createdAt: string;
  currentDreamId?: string;
  dreamHistory: string[];
  sessionTargetMinutes?: number;
  voicePreferences?: string;
};

export type ProfileInput = {
  name: string;
  age: number;
  interests?: string[];
  notes?: string;
};

export type ProfileSettingsInput = {
  name?: string;
  age?: number;
  sessionTargetMinutes?: number | null;
  voicePreferences?: string | null;
  notes?: string | null;
  interests?: readonly string[] | null;
};

export const DEFAULT_SESSION_TARGET_MINUTES = 20;
