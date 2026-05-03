export type DreamCategory = "arcade" | "creative" | "personal" | "utility" | "art";

export const DREAM_CATEGORIES = [
  "arcade",
  "creative",
  "personal",
  "utility",
  "art",
] as const satisfies readonly DreamCategory[];

export type DreamDifficulty = 1 | 2 | 3 | 4 | 5;

export type DreamMode = "project" | "conversation";

export type DreamDefinition = {
  id: string;
  mode?: DreamMode;
  title_parent: string;
  title_kid: string;
  summary_kid: string;
  categories: DreamCategory[];
  interest_tags: string[];
  requires: string[];
  style_hints: string[];
  emoji: string;
};

export type Dream = DreamDefinition & {
  difficulty: DreamDifficulty;
};

export type DreamLibrary = {
  dreams: Dream[];
  byId: Record<string, Dream>;
};

export type DreamValidationError =
  | { kind: "duplicate-id"; id: string }
  | { kind: "unresolved-requires"; id: string; prereq: string }
  | { kind: "empty-requires"; id: string }
  | { kind: "empty-categories"; id: string };

export type DreamValidation =
  | { ok: true; library: DreamLibrary }
  | { ok: false; errors: DreamValidationError[] };
