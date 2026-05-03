import type { DreamLibrary } from "@shared/dreams";
import type { KnowledgeGraph } from "@shared/knowledgeGraph";
import type { Progress } from "@shared/progress";
import type { JSX } from "react";
import { chooseNextSuggestion } from "./nextKpSuggestion";

export type ParentNextKpProps = {
  graph: KnowledgeGraph | null;
  library: DreamLibrary | null;
  currentDreamId: string | null;
  progress: Progress | null;
};

export function ParentNextKp({
  graph,
  library,
  currentDreamId,
  progress,
}: ParentNextKpProps): JSX.Element {
  if (!progress) {
    return (
      <section className="hb-parent-card">
        <h2 className="hb-parent-section-title">Suggested next focus</h2>
        <p className="hb-parent-empty">Loading progress...</p>
      </section>
    );
  }

  const suggestion = chooseNextSuggestion({ graph, library, currentDreamId, progress });

  return (
    <section className="hb-parent-card">
      <h2 className="hb-parent-section-title">Suggested next focus</h2>
      {suggestion.kind === "no-dream" ? (
        <p className="hb-parent-empty">Pick a dream first and Bit will know what to teach next.</p>
      ) : null}
      {suggestion.kind === "loading" ? (
        <p className="hb-parent-empty">Loading the knowledge graph...</p>
      ) : null}
      {suggestion.kind === "unknown-dream" ? (
        <p className="hb-parent-empty">
          Dream <code>{suggestion.dreamId}</code> is no longer in the library.
        </p>
      ) : null}
      {suggestion.kind === "unresolved-prereqs" ? (
        <div>
          <p className="hb-next-kp-warning">This dream needs knowledge points that are missing:</p>
          <ul className="hb-next-kp-missing-list">
            {suggestion.missing.map((id) => (
              <li key={id}>
                <code>{id}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {suggestion.kind === "all-done" ? (
        <p className="hb-next-kp-done">
          Every required skill is at did-with-help or above. The dream is shippable.
        </p>
      ) : null}
      {suggestion.kind === "freeform" ? (
        <p className="hb-parent-empty">Free build mode has no fixed skill plan.</p>
      ) : null}
      {suggestion.kind === "next-kp" ? (
        <div className="hb-next-kp-panel">
          <div className="t-pixel hb-next-kp-kicker">Up next</div>
          <h3 className="hb-next-kp-title">{suggestion.kp.title_parent}</h3>
          <p className="hb-next-kp-kid">For your kid: {suggestion.kp.title_kid}</p>
          <dl className="hb-next-kp-signals">
            <div>
              <dt className="t-pixel hb-next-kp-dt">Saw it</dt>
              <dd>{suggestion.kp.mastery_signals.saw_it}</dd>
            </div>
            <div>
              <dt className="t-pixel hb-next-kp-dt">Did with help</dt>
              <dd>{suggestion.kp.mastery_signals.did_with_help}</dd>
            </div>
            <div>
              <dt className="t-pixel hb-next-kp-dt">Did unprompted</dt>
              <dd>{suggestion.kp.mastery_signals.did_unprompted}</dd>
            </div>
            <div>
              <dt className="t-pixel hb-next-kp-dt">Explained it</dt>
              <dd>{suggestion.kp.mastery_signals.explained_it}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}
