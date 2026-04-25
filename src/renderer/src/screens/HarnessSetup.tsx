import type { HarnessId } from "@shared/config";
import { HARNESS_IDS, REFERENCE_HARNESS } from "@shared/config";
import { type JSX, useState } from "react";
import { useConfigStore } from "../state/configStore";

const ORDERED_HARNESS_IDS: readonly HarnessId[] = [
  REFERENCE_HARNESS,
  ...HARNESS_IDS.filter((id) => id !== REFERENCE_HARNESS),
];

const HARNESS_LABELS: Record<HarnessId, { title: string; blurb: string }> = {
  claude: {
    title: "Claude Code",
    blurb: "Anthropic's CLI. Uses CLAUDE.md for Bit's system prompt.",
  },
  codex: {
    title: "Codex",
    blurb: "OpenAI's CLI. Reads AGENTS.md for Bit's system prompt.",
  },
  opencode: {
    title: "OpenCode",
    blurb: "Open-source CLI. Reads AGENTS.md for Bit's system prompt.",
  },
};

export type HarnessSetupProps = {
  onDone: () => void;
};

export function HarnessSetup({ onDone }: HarnessSetupProps): JSX.Element {
  const status = useConfigStore((s) => s.status);
  const error = useConfigStore((s) => s.error);
  const config = useConfigStore((s) => s.config);
  const detection = useConfigStore((s) => s.detection);
  const load = useConfigStore((s) => s.load);
  const setDefaultHarness = useConfigStore((s) => s.setDefaultHarness);

  const [saving, setSaving] = useState<HarnessId | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (status === "idle" || status === "loading") {
    return (
      <main className="hb-gate">
        <p className="hb-gate-loading">Looking for your agent...</p>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="hb-gate">
        <div className="hb-gate-card">
          <h1>Can't read your Hi Bit config.</h1>
          <p className="hb-gate-sub">{error ?? "Something went sideways."}</p>
          <button type="button" className="hb-btn hb-btn-primary" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  const anyDetected = detection ? HARNESS_IDS.some((id) => detection[id] !== null) : false;

  const pick = async (harness: HarnessId) => {
    setSaving(harness);
    setSaveError(null);
    try {
      await setDefaultHarness(harness);
      onDone();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save your choice");
    } finally {
      setSaving(null);
    }
  };

  return (
    <main className="hb-gate">
      <div className="hb-gate-card">
        <div className="t-pixel hb-gate-kicker">Step 2 of 2</div>
        <h1>Pick an agent.</h1>
        <p className="hb-gate-sub">
          Bit shells out to the CLI agent you already have installed. You can change this later in
          settings.
        </p>

        {!anyDetected ? (
          <p className="hb-form-err">
            We couldn't find <code>claude</code>, <code>codex</code>, or <code>opencode</code> on
            your PATH. Install one and come back, or pick one below to use anyway.
          </p>
        ) : null}

        <ul className="hb-harness-list">
          {ORDERED_HARNESS_IDS.map((id) => {
            const detected = detection?.[id] ?? null;
            const configured = config?.harness[id] ?? null;
            const path = configured ?? detected;
            const labels = HARNESS_LABELS[id];
            const isDefault = config?.defaultHarness === id;
            const isReference = id === REFERENCE_HARNESS;
            return (
              <li key={id}>
                <button
                  type="button"
                  className="hb-harness-card"
                  onClick={() => void pick(id)}
                  disabled={saving !== null}
                  aria-pressed={isDefault}
                >
                  <span className="hb-harness-text">
                    <span className="hb-harness-name">
                      {labels.title}
                      {isDefault ? (
                        <span className="hb-harness-tag t-pixel">Default</span>
                      ) : isReference ? (
                        <span className="hb-harness-tag t-pixel">Recommended</span>
                      ) : null}
                    </span>
                    <span className="hb-harness-blurb t-small">{labels.blurb}</span>
                    <span className="hb-harness-path t-small">
                      {path ? (
                        <>
                          <span className="hb-harness-ok">Found:</span> {path}
                        </>
                      ) : (
                        <span className="hb-harness-missing">Not on PATH</span>
                      )}
                    </span>
                  </span>
                  <span className="hb-harness-cta t-pixel">
                    {saving === id ? "Saving..." : isDefault ? "In use" : "Use this"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {saveError ? <p className="hb-form-err">{saveError}</p> : null}
      </div>
    </main>
  );
}
