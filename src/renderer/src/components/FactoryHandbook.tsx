import type { ArcId, MasteryState } from "@shared/curriculum";
import type { LearningProgressView } from "@shared/learning";
import { useEffect, useRef } from "react";

type FactoryHandbookProps = {
  builderName: string;
  progress: LearningProgressView | null;
  onClose: () => void;
};

/** Kid-facing words for each mastery state - warm and encouraging, never a grade. */
const MASTERY_WORDS: Record<MasteryState, string> = {
  unseen: "Not yet",
  met: "Trying it",
  grasped: "Got it",
  fluent: "Mastered",
};

/**
 * The Factory Handbook: the kid's growing map of what they can do as a builder.
 * It fills in as their skills go from "Not yet" to "Mastered". It reads as a
 * collection to be proud of, opened only when the kid chooses to - never a badge
 * pushed into chat.
 */
export function FactoryHandbook({ builderName, progress, onClose }: FactoryHandbookProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    dialogRef.current?.focus();
  }, []);

  const close = () => {
    const returnFocus = returnFocusRef.current;
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
    onClose();
  };

  const skillsByArc = (arc: ArcId) => (progress?.skills ?? []).filter((skill) => skill.arc === arc);

  const masteredCount = progress?.counts.fluent ?? 0;
  const totalCount = progress?.counts.total ?? 0;

  return (
    <div className="hb-handbook-backdrop">
      <section
        className="hb-card hb-handbook"
        aria-label={`What ${builderName} can do`}
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <header className="hb-handbook-head">
          <div className="hb-handbook-title">
            <h2>What you can do, {builderName}</h2>
            <p className="hb-handbook-reach">
              You can build: <strong>{progress?.tierLabel ?? "your first creation"}</strong>
            </p>
          </div>
          <span
            className="hb-handbook-count"
            role="img"
            aria-label={`${masteredCount} of ${totalCount} mastered`}
          >
            {masteredCount}/{totalCount}
          </span>
          <button className="hb-button hb-button-secondary" type="button" onClick={close}>
            Close
          </button>
        </header>

        <div className="hb-handbook-arcs">
          {(progress?.arcs ?? []).map((arc) => (
            <section key={arc.id} className="hb-handbook-arc">
              <h3>{arc.title}</h3>
              <ul className="hb-handbook-skills">
                {skillsByArc(arc.id).map((skill) => (
                  <li
                    key={skill.id}
                    className="hb-handbook-skill"
                    data-mastery={skill.mastery}
                    data-done={skill.mastery === "fluent" ? "true" : "false"}
                  >
                    <span className="hb-handbook-skill-label">{skill.kidLabel}</span>
                    <span className="hb-handbook-skill-state">{MASTERY_WORDS[skill.mastery]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
