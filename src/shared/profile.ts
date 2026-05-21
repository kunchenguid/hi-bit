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

export type ProfileSummary = {
  schemaVersion: 1;
  id: string;
  name: string;
  age: number;
  interests: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProfileRecord = ProfileSummary;
