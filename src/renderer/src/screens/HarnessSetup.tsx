import type { AgentId } from "@shared/config";
import { AGENT_IDS, REFERENCE_AGENT } from "@shared/config";
import { type JSX, useState } from "react";
import { useConfigStore } from "../state/configStore";

const ORDERED_AGENT_IDS: readonly AgentId[] = [
  REFERENCE_AGENT,
  ...AGENT_IDS.filter((id) => id !== REFERENCE_AGENT),
];

const AGENT_LABELS: Record<AgentId, { title: string; blurb: string }> = {
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
  const load = useConfigStore((s) => s.load);
  const setDefaultAgent = useConfigStore((s) => s.setDefaultAgent);

  const [saving, setSaving] = useState<AgentId | null>(null);
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

  const pick = async (agent: AgentId) => {
    setSaving(agent);
    setSaveError(null);
    try {
      await setDefaultAgent(agent);
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
          Bit talks to the supported ACP agent you choose. Make sure that agent is installed on your
          machine; you can change this later in settings.
        </p>

        <ul className="hb-harness-list">
          {ORDERED_AGENT_IDS.map((id) => {
            const labels = AGENT_LABELS[id];
            const isDefault = config?.defaultAgent === id;
            const isReference = id === REFERENCE_AGENT;
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
