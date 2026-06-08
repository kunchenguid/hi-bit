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

/**
 * A read-only snapshot of where a builder is in the agentic-engineering
 * curriculum. It feeds both reflection surfaces: the kid's Factory Handbook
 * (kid labels + mastery, grouped by arc) and the grown-up progress window
 * (real-skill names + mastery + reach + roadmap).
 */
export type LearningProgressView = {
  reachableTier: BuildTier;
  tierLabel: string;
  arcs: ArcDef[];
  skills: SkillProgress[];
  roadmap: RoadmapItem[];
  counts: { fluent: number; grasped: number; met: number; total: number };
};

export function buildLearningProgress(
  skillMastery: MasteryMap,
  roadmap: RoadmapItem[],
): LearningProgressView {
  const skills = skillProgress(skillMastery);
  const tier = reachableTier(skillMastery);
  const tierLabel = BUILD_TIERS.find((definition) => definition.tier === tier)?.label ?? "";
  const counts = {
    fluent: skills.filter((skill) => skill.mastery === "fluent").length,
    grasped: skills.filter((skill) => skill.mastery === "grasped").length,
    met: skills.filter((skill) => skill.mastery === "met").length,
    total: skills.length,
  };
  return { reachableTier: tier, tierLabel, arcs: [...ARCS], skills, roadmap, counts };
}
