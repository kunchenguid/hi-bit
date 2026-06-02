import mascotBit from "@design/assets/mascot-boo.svg";
import type { CreationActivity, ToolActivity } from "@shared/chat";
import type { ProjectSummary } from "@shared/project";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { friendlyStep } from "../activity";
import { type BotLane, buildFactoryFloor, type CreationFloor } from "../factory";

type FactoryViewProps = {
  creations: ProjectSummary[];
  activity: CreationActivity[];
  /** Creations with a live or restartable preview, shown as ready to play. */
  playableProjectIds: Set<string>;
  onPlay: (projectId: string) => void;
  onClose: () => void;
};

type Selected = { projectId: string; botId: string };

/** Arcade-cabinet screen tints, picked per creation so the floor reads colorful. */
const SCREEN_WASHES = [
  "var(--subject-css-wash)",
  "var(--subject-js-wash)",
  "var(--subject-art-wash)",
  "var(--subject-html-wash)",
  "var(--subject-math-wash)",
];

/**
 * The factory floor: every creation is a machine on a conveyor belt, the bots
 * working it standing at its bench (no names - each is a stable color + face), a
 * speech-bubble ticker calling out the latest action, and a tap on any bot
 * opening its step-by-step Logbook below. One surface that is both the kid's
 * shelf of creations and their Logbook.
 */
export function FactoryView({
  creations,
  activity,
  playableProjectIds,
  onPlay,
  onClose,
}: FactoryViewProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    dialogRef.current?.focus();
  }, []);

  const close = () => {
    const returnFocus = returnFocusRef.current;
    if (returnFocus instanceof HTMLElement) returnFocus.focus();
    onClose();
  };

  const floor = buildFactoryFloor(creations, activity, playableProjectIds);
  const openMachine = floor.find((machine) => machine.projectId === selected?.projectId) ?? null;
  const openBot = openMachine?.bots.find((bot) => bot.botId === selected?.botId) ?? null;

  return (
    <div className="hb-factory-backdrop">
      <section
        className="hb-card hb-factory"
        aria-label="Your factory"
        aria-modal="true"
        onKeyDown={(event) => keepFocusInside(event, dialogRef.current, close)}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="hb-factory-head">
          <span className="hb-bit-badge" aria-hidden="true">
            <img
              className="hb-bit-badge-mascot pixel-art"
              src={mascotBit}
              alt=""
              width={36}
              height={36}
            />
          </span>
          <div className="hb-factory-title">
            <h2>Your factory</h2>
            <p className="t-small">
              Every creation, and the bots building it. Tap a bot to follow it.
            </p>
          </div>
          <button type="button" className="hb-button hb-button-secondary" onClick={close}>
            Close
          </button>
        </header>

        {floor.length === 0 ? (
          <p className="t-small">No creations yet. Ask Bit to build something!</p>
        ) : (
          <div className="hb-factory-floor">
            {floor.map((machine) => (
              <Machine
                key={machine.projectId}
                machine={machine}
                selectedBotId={selected?.projectId === machine.projectId ? selected.botId : null}
                onSelectBot={(botId) =>
                  setSelected((current) =>
                    current?.projectId === machine.projectId && current.botId === botId
                      ? null
                      : { projectId: machine.projectId, botId },
                  )
                }
                onPlay={() => {
                  onPlay(machine.projectId);
                  close();
                }}
              />
            ))}
          </div>
        )}

        {openMachine && openBot ? <BotLogbook title={openMachine.title} bot={openBot} /> : null}
      </section>
    </div>
  );
}

function Machine({
  machine,
  selectedBotId,
  onSelectBot,
  onPlay,
}: {
  machine: CreationFloor;
  selectedBotId: string | null;
  onSelectBot: (botId: string) => void;
  onPlay: () => void;
}) {
  const ticker = tickerFor(machine);
  return (
    <div className="hb-factory-station" data-status={machine.status}>
      <p className={`hb-factory-ticker ${ticker.ready ? "is-ready" : ""}`}>{ticker.text}</p>
      <div className="hb-factory-machine">
        <div className="hb-factory-screen" style={{ background: screenWash(machine.projectId) }}>
          <span className="hb-factory-screen-letter" aria-hidden="true">
            {machine.title.slice(0, 1).toUpperCase()}
          </span>
        </div>
        <p className="hb-factory-name">{machine.title}</p>
        <div className="hb-factory-footrow">
          {machine.bots.length > 0 ? (
            <span className="hb-factory-bots">
              {machine.bots.map((bot) => (
                <BotAvatar
                  key={bot.botId}
                  bot={bot}
                  open={bot.botId === selectedBotId}
                  onClick={() => onSelectBot(bot.botId)}
                />
              ))}
            </span>
          ) : (
            <span />
          )}
          <span
            className={`hb-factory-light ${machine.status === "working" ? "is-working" : "is-done"}`}
            aria-hidden="true"
          />
        </div>
        {machine.playable ? (
          <button type="button" className="hb-play-button hb-play-button-chip" onClick={onPlay}>
            <span aria-hidden="true">▶</span> Play
          </button>
        ) : null}
      </div>
    </div>
  );
}

function BotAvatar({ bot, open, onClick }: { bot: BotLane; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`hb-factory-bot ${open ? "is-open" : ""} ${bot.working ? "is-working" : ""}`}
      style={{ borderColor: swatch(bot.hue) }}
      onClick={onClick}
      aria-pressed={open}
      aria-label={`${bot.working ? "A working bot" : "A finished bot"} - ${bot.latestAction}`}
    >
      <img
        className="pixel-art"
        src={mascotBit}
        alt=""
        width={20}
        height={20}
        style={{ filter: `hue-rotate(${bot.hue}deg) saturate(1.2)` }}
      />
    </button>
  );
}

function BotLogbook({ title, bot }: { title: string; bot: BotLane }) {
  return (
    <div className="hb-factory-logbook">
      <div className="hb-factory-logbook-head">
        <span
          className="hb-factory-swatch"
          aria-hidden="true"
          style={{ background: swatch(bot.hue) }}
        />
        <strong>
          A bot on {title} - {bot.working ? "building now" : "all done"}
        </strong>
      </div>
      {bot.steps.length === 0 ? (
        <p className="t-small">Getting started...</p>
      ) : (
        <div className="hb-factory-steps">
          {bot.steps.map((step) => (
            <div className="hb-step" key={`${step.turnId ?? ""}:${step.callId}`}>
              <span className="hb-step-grow">{friendlyStep(step.toolName)}</span>
              <span className={`hb-tool-status hb-tool-status-${step.status}`}>
                {stepStatusLabel(step.status)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function tickerFor(machine: CreationFloor): { text: string; ready: boolean } {
  if (machine.status === "working") {
    return { text: machine.latestAction ?? "getting started", ready: false };
  }
  return { text: machine.playable ? "ready to play ✓" : "all done", ready: true };
}

function stepStatusLabel(status: ToolActivity["status"]): string {
  if (status === "completed") return "done";
  if (status === "failed") return "stopped";
  return "running";
}

function screenWash(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i += 1) hash = (hash * 31 + projectId.charCodeAt(i)) % 997;
  return SCREEN_WASHES[hash % SCREEN_WASHES.length];
}

function swatch(hue: number): string {
  return `hsl(${hue}, 70%, 52%)`;
}

function keepFocusInside(
  event: KeyboardEvent<HTMLElement>,
  dialog: HTMLElement | null,
  close: () => void,
): void {
  if (event.key === "Escape") {
    close();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const focusable = getFocusableElements(dialog);
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.tabIndex >= 0);
}
