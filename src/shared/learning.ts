import {
  ARCS,
  type ArcDef,
  BUILD_TIERS,
  type BuildTier,
  type MasteryMap,
  reachableTier,
  type SkillProgress,
  skillProgress,
} from "./curriculum";
import type { RoadmapItem } from "./profile";
import type { SubjectProgressView } from "./subjects";

/**
 * A read-only snapshot of where a builder is in the agentic-engineering
 * curriculum, plus every learning subject they asked Bit to teach. It feeds
 * both reflection surfaces: the kid's Factory Handbook (kid labels + mastery,
 * grouped by arc, plus their subjects) and My progress
 * (real-skill names + mastery + reach + roadmap + subject goals).
 */
export type LearningProgressView = {
  reachableTier: BuildTier;
  tierLabel: string;
  arcs: ArcDef[];
  skills: SkillProgress[];
  roadmap: RoadmapItem[];
  counts: { fluent: number; grasped: number; total: number };
  /** The builder's learning subjects, read from their learning creations' files. */
  subjects: SubjectProgressView[];
};

export function buildLearningProgress(
  skillMastery: MasteryMap,
  roadmap: RoadmapItem[],
  subjects: SubjectProgressView[] = [],
): LearningProgressView {
  const skills = skillProgress(skillMastery);
  const tier = reachableTier(skillMastery);
  const tierLabel = BUILD_TIERS.find((definition) => definition.tier === tier)?.label ?? "";
  const counts = {
    fluent: skills.filter((skill) => skill.mastery === "fluent").length,
    grasped: skills.filter((skill) => skill.mastery === "grasped").length,
    total: skills.length,
  };
  return { reachableTier: tier, tierLabel, arcs: [...ARCS], skills, roadmap, counts, subjects };
}
