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
};

/** Kid-facing caption for the pending Bit bubble while it digests a bot's build. */
const BOT_RESULT_CAPTION = "Bit is checking out what the bot made...";

/** How close to the bottom (px) still counts as "looking at the latest". */
const STICK_THRESHOLD = 24;

export function MessageList({
  messages,
  thinking,
  thinkingReason = "reply",
  playableProjectIds,
  onPlay,
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
        <p className="t-small">
          Ask Bit to build a button, a tiny game, a fan page, or anything web-shaped.
        </p>
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
