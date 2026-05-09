import mascotBooUrl from "@design/assets/mascot-boo.svg";
import type { JSX, ReactNode } from "react";

export type KidShellView = "home" | "picker" | "projects";

export type KidShellProps = {
  current: KidShellView;
  onNavigate: (view: KidShellView) => void;
  onEnterParentMode: () => void;
  children: ReactNode;
};

export function KidShell({
  current,
  onNavigate,
  onEnterParentMode,
  children,
}: KidShellProps): JSX.Element {
  return (
    <div className="hb-kid-shell">
      <nav className="hb-kid-nav" aria-label="Kid navigation">
        <button
          type="button"
          className="hb-kid-nav-home"
          onClick={() => onNavigate("home")}
          aria-pressed={current === "home"}
          aria-label="Back to chat with Bit"
        >
          <img
            className="hb-kid-nav-mascot"
            src={mascotBooUrl}
            alt=""
            aria-hidden="true"
            width={28}
            height={28}
          />
          <span className="hb-kid-nav-home-name">Bit</span>
        </button>
        <div className="hb-kid-nav-tabs">
          <button
            type="button"
            className="hb-kid-nav-tab"
            onClick={() => onNavigate("picker")}
            aria-pressed={current === "picker"}
          >
            Switch dream
          </button>
          <button
            type="button"
            className="hb-kid-nav-tab"
            onClick={() => onNavigate("projects")}
            aria-pressed={current === "projects"}
          >
            My projects
          </button>
        </div>
        <div className="hb-kid-nav-actions">
          <button
            type="button"
            className="hb-btn hb-btn-ghost hb-btn-sm hb-btn-parent"
            onClick={onEnterParentMode}
          >
            For grown-ups
          </button>
        </div>
      </nav>
      <div className="hb-kid-shell-body">{children}</div>
    </div>
  );
}
