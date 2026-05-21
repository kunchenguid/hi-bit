import type { ProjectSummary } from "@shared/project";
import { useState } from "react";

type ProjectPickerProps = {
  projects: ProjectSummary[];
  busy: boolean;
  onCreate: (title: string) => Promise<void>;
  onOpen: (project: ProjectSummary) => void;
  onLogout: () => void;
};

export function ProjectPicker({ projects, busy, onCreate, onOpen, onLogout }: ProjectPickerProps) {
  const [title, setTitle] = useState("");

  return (
    <main className="hb-shell hb-picker-shell">
      <header className="hb-topbar">
        <div>
          <p className="t-pixel">HI BIT</p>
          <h1>What do you want to build?</h1>
        </div>
        <button className="hb-button hb-button-secondary" type="button" onClick={onLogout}>
          Log out
        </button>
      </header>

      <section className="hb-card hb-new-project-card">
        <h2>New project</h2>
        <p className="t-small">
          Start with a tiny local web page. Bit can turn it into a game, tool, or experiment.
        </p>
        <form
          className="hb-new-project-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onCreate(title).then(() => setTitle(""));
          }}
        >
          <label htmlFor="project-title">Project name</label>
          <input
            id="project-title"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="Space garden"
          />
          <button className="hb-button hb-button-primary" type="submit" disabled={busy}>
            Create
          </button>
        </form>
      </section>

      <section className="hb-project-grid" aria-label="Projects">
        {projects.map((project) => (
          <button
            className="hb-project-card"
            key={project.id}
            type="button"
            onClick={() => onOpen(project)}
          >
            <span className="t-pixel">Project</span>
            <strong>{project.title}</strong>
            <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
      </section>
    </main>
  );
}
