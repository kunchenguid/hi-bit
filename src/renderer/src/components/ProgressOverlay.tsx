import type { LearningProgressView } from "@shared/learning";
import { useEffect, useRef } from "react";
import { keepFocusInside } from "./focusTrap";
import { Icon } from "./Icon";
import { ParentProgressWindow } from "./ParentProgressWindow";

type ProgressOverlayProps = {
  builderName: string;
  progress: LearningProgressView | null;
  onClose: () => void;
};

export function ProgressOverlay({ builderName, progress, onClose }: ProgressOverlayProps) {
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

  return (
    <div className="hb-handbook-backdrop">
      <section
        className="hb-card hb-progress-overlay"
        aria-label={`My progress for ${builderName}`}
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={(event) => keepFocusInside(event, dialogRef.current, close)}
      >
        <header className="hb-progress-overlay-head">
          <div className="hb-progress-overlay-title">
            <Icon name="i-trophy" />
            <h2>My progress</h2>
          </div>
          <button className="hb-button hb-button-secondary" type="button" onClick={close}>
            <Icon name="i-arrow-left" />
            Back to building
          </button>
        </header>
        <ParentProgressWindow builderName={builderName} progress={progress} />
      </section>
    </div>
  );
}
