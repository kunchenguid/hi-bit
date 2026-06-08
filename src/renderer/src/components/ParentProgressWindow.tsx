import type { MasteryState } from "@shared/curriculum";
import type { LearningProgressView } from "@shared/learning";

type ParentProgressWindowProps = {
  builderName: string;
  progress: LearningProgressView | null;
};

/** Parent-facing words for mastery - plain about what is genuinely learned. */
const MASTERY_WORDS: Record<MasteryState, string> = {
  unseen: "not started",
  met: "encountered",
  grasped: "done with help",
  fluent: "fluent",
};

/**
 * The grown-up's window into what Hi-Bit is actually teaching: the real
 * agentic-engineering skills the kid is building, named plainly, with how far
 * along each is, the kind of creation they can now take on, and the ideas
 * they have parked. This is what makes the learning legible to the buyer.
 */
export function ParentProgressWindow({ builderName, progress }: ParentProgressWindowProps) {
  if (!progress) {
    return (
      <section className="hb-progress-window" aria-label="Learning progress">
        <h3 className="hb-progress-heading">What {builderName} is learning</h3>
        <p className="hb-progress-empty">No progress yet - it fills in as {builderName} builds.</p>
      </section>
    );
  }

  const learned = progress.counts.fluent + progress.counts.grasped;
  const parked = progress.roadmap.filter((item) => item.status !== "done");

  return (
    <section className="hb-progress-window" aria-label="Learning progress">
      <h3 className="hb-progress-heading">What {builderName} is learning</h3>
      <p className="hb-progress-summary">
        Agentic engineering: directing AI to build real things. {builderName} is{" "}
        <strong>{progress.counts.fluent}</strong> skills fluent ({learned} of {progress.counts.total}{" "}
        underway), and can now take on <strong>{progress.tierLabel.toLowerCase()}</strong>.
      </p>

      <div className="hb-progress-arcs">
        {progress.arcs.map((arc) => {
          const skills = progress.skills.filter((skill) => skill.arc === arc.id);
          return (
            <div key={arc.id} className="hb-progress-arc">
              <h4>{arc.title}</h4>
              <ul>
                {skills.map((skill) => (
                  <li key={skill.id} className="hb-progress-skill" data-mastery={skill.mastery}>
                    <span className="hb-progress-skill-name">{skill.realSkill}</span>
                    <span className="hb-progress-skill-state">{MASTERY_WORDS[skill.mastery]}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {parked.length > 0 ? (
        <div className="hb-progress-roadmap">
          <h4>Ideas parked for later</h4>
          <ul>
            {parked.map((item) => (
              <li key={item.id}>{item.title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
