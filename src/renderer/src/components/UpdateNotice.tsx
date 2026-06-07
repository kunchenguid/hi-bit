import type { UpdateStatus } from "@shared/ipc";
import { useEffect, useRef, useState } from "react";

// Hi-Bit is delivered through the Homebrew cask in kunchenguid/homebrew-tap (see
// .github/workflows/release-please.yml), so this is the upgrade command we hand
// grown-ups: `brew update` refreshes the tap, then `brew upgrade --cask hi-bit`
// installs the new build. Exported so the test pins the exact string.
export const UPGRADE_COMMAND = "brew update && brew upgrade --cask hi-bit";

type UpdateNoticeProps = {
  status: UpdateStatus;
};

/**
 * The "a newer Hi-Bit is out" block shown inside the Grown-up menu. Updating is a
 * parent task (it runs a terminal command), so this lives out of the kid's way
 * rather than in the chat chrome. Renders nothing unless an update is available.
 */
export function UpdateNotice({ status }: UpdateNoticeProps) {
  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  if (!status.updateAvailable) return null;

  async function copyCommand() {
    if (!navigator.clipboard?.writeText) return;

    try {
      await navigator.clipboard.writeText(UPGRADE_COMMAND);
      setCopied(true);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the command stays visible to copy by hand.
    }
  }

  return (
    <section className="hb-update-notice" aria-label="update available">
      <p className="hb-update-notice-title">
        <span aria-hidden="true">⬆</span> Update available
        {status.latestVersion ? ` - v${status.latestVersion}` : null}
      </p>
      <p className="hb-update-notice-sub t-small">
        You{"’"}re on v{status.currentVersion}. Run this in a terminal to update:
      </p>
      <div className="hb-update-notice-command">
        <code>{UPGRADE_COMMAND}</code>
        <button
          className="hb-button hb-button-secondary hb-update-notice-copy"
          type="button"
          aria-label="copy update command"
          onClick={() => void copyCommand()}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button
        className="hb-button hb-button-secondary"
        type="button"
        onClick={() => void window.hibit?.app.openReleasePage()}
      >
        Release notes
      </button>
    </section>
  );
}
