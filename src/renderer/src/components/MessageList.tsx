import type { ChatMessage, TurnKind } from "@shared/chat";
import { useLayoutEffect, useRef } from "react";
import { MarkdownText } from "./MarkdownText";

type MessageListProps = {
  messages: ChatMessage[];
  thinking: boolean;
  /** Why Bit is thinking, so the bubble can explain a bot-result wait to the kid. */
  thinkingReason?: TurnKind;
  /** Playable creations (running or restartable), so their "ready" message can offer Play. */
  playableProjectIds?: Set<string>;
  onPlay?: (projectId: string) => void;
  /** The builder's name, so the day-one empty state can greet them warmly. */
  builderName?: string;
  /** Drop a starter idea into the composer (the kid still presses Send). */
  onPickIdea?: (text: string) => void;
};

const BOT_RESULT_CAPTION = "Bit is checking out what the bot made...";

// Idea sparks for the very first screen, before any message exists. Tapping one
// fills the composer with an editable starter sentence - it never sends. These
// live ONLY on the empty state and disappear the instant the thread has a
// message, which is what keeps them clear of the "no fixed CTA wall under Bit's
// replies" rule. Wording stays in day-one kid vocabulary (build, game, page).
const IDEA_SPARKS: ReadonlyArray<{ emoji: string; label: string; fill: string }> = [
  { emoji: "🎮", label: "A tiny game", fill: "a tiny game where I dodge falling rocks" },
  { emoji: "⭐", label: "A page about me", fill: "a page about me and my favorite things" },
  {
    emoji: "🔊",
    label: "A silly sound button",
    fill: "a button that makes a silly sound when I click it",
  },
  { emoji: "🎲", label: "Surprise me", fill: "surprise me with something fun to build" },
];

/** How close to the bottom (px) still counts as "looking at the latest". */
const STICK_THRESHOLD = 24;

export function MessageList({
  messages,
  thinking,
  thinkingReason = "reply",
  playableProjectIds,
  onPlay,
  builderName,
  onPickIdea,
}: MessageListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  // Whether the kid is parked at the bottom. Stays true until they scroll up to
  // re-read, so streaming text and new bubbles only auto-follow when wanted.
  const stickToBottom = useRef(true);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
  };

  // Runs on every message/thinking change (including each streamed delta, since
  // each delta hands us a fresh messages array). Pin to the bottom only when the
  // kid was already there.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || (messages.length === 0 && !thinking)) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  if (messages.length === 0 && !thinking) {
    return (
      <div className="hb-empty-chat">
        <p className="hb-empty-greeting">
          {builderName ? `Hi ${builderName}! ` : ""}Ready to build?
        </p>
        <p className="t-small">Tap an idea to start, or just type your own.</p>
        <div className="hb-idea-sparks">
          {IDEA_SPARKS.map((spark) => (
            <button
              key={spark.label}
              type="button"
              className="hb-idea-spark"
              onClick={() => onPickIdea?.(spark.fill)}
            >
              <span className="hb-idea-spark-emoji" aria-hidden="true">
                {spark.emoji}
              </span>
              {spark.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <ol className="hb-message-list" aria-label="Conversation" ref={listRef} onScroll={handleScroll}>
      {messages.map((message) => {
        const canPlay =
          message.role === "assistant" &&
          !!message.projectId &&
          !!onPlay &&
          !!playableProjectIds?.has(message.projectId);
        return (
          <li className={`hb-message hb-message-${message.role}`} key={message.id}>
            <span className="hb-message-label">{message.role === "user" ? "You" : "Bit"}</span>
            {message.role === "assistant" ? (
              <MarkdownText text={message.text} />
            ) : (
              <p>{message.text}</p>
            )}
            {canPlay ? (
              <button
                type="button"
                className="hb-play-button"
                onClick={() => onPlay?.(message.projectId as string)}
              >
                <span aria-hidden="true">▶</span> Play
              </button>
            ) : null}
          </li>
        );
      })}
      {thinking ? (
        <li
          className="hb-message hb-message-assistant hb-message-thinking"
          aria-live="polite"
          aria-label={thinkingReason === "bot_result" ? BOT_RESULT_CAPTION : "Bit is thinking"}
        >
          <span className="hb-message-label">Bit</span>
          {thinkingReason === "bot_result" ? (
            <span className="hb-thinking-caption">{BOT_RESULT_CAPTION}</span>
          ) : null}
          <span className="hb-thinking-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </li>
      ) : null}
    </ol>
  );
}
