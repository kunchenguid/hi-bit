import { type FormEvent, type JSX, useEffect, useLayoutEffect, useRef, useState } from "react";
import { canRetryLastParentMessage, useParentChatStore } from "../../state/parentChatStore";
import { PARENT_DIRECTIVE_PRESETS, resolveDirectivePreset } from "./parentDirectivePresets";

export type ParentChatProps = {
  profileId: string;
  parentSessionId: string;
  parentName?: string;
  kidName: string;
};

export function ParentChat({
  profileId,
  parentSessionId,
  parentName = "You",
  kidName,
}: ParentChatProps): JSX.Element {
  const messages = useParentChatStore((s) => s.messages);
  const status = useParentChatStore((s) => s.status);
  const send = useParentChatStore((s) => s.send);
  const retry = useParentChatStore((s) => s.retry);
  const hydrate = useParentChatStore((s) => s.hydrate);
  const hydrateStatus = useParentChatStore((s) => s.hydrateStatus);
  const hydratedSessionId = useParentChatStore((s) => s.hydratedSessionId);

  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (hydratedSessionId === parentSessionId) return;
    void hydrate(profileId, parentSessionId);
  }, [profileId, parentSessionId, hydratedSessionId, hydrate]);

  useEffect(() => {
    if (prevStatusRef.current === "sending" && status !== "sending") {
      inputRef.current?.focus();
    }
    prevStatusRef.current = status;
  }, [status]);

  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    void lastMessageId;
    void status;
    el.scrollTop = el.scrollHeight;
  }, [lastMessageId, status]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed.length === 0 || status === "sending") return;
    setInput("");
    await send(profileId, trimmed);
  }

  const disabled = status === "sending" || input.trim().length === 0;
  const showPresets = messages.length === 0 && hydrateStatus !== "loading";
  const canRetry = status !== "sending" && canRetryLastParentMessage(messages);

  function handlePreset(presetId: string): void {
    const text = resolveDirectivePreset(presetId, kidName);
    if (text) setInput(text);
  }

  async function handleRetry(): Promise<void> {
    if (!canRetry) return;
    await retry(profileId);
  }

  return (
    <section className="hb-parent-card hb-parent-chat">
      <div className="hb-parent-chat-heading">
        <h2 className="hb-parent-section-title">Co-teacher chat</h2>
        <p className="hb-parent-chat-hint">
          Give Bit directives like "focus on loops this week" or "slow down on CSS".
        </p>
      </div>

      {showPresets ? (
        <fieldset className="hb-parent-directive-presets">
          <legend className="hb-parent-directive-presets-legend t-pixel">Try asking</legend>
          {PARENT_DIRECTIVE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="hb-parent-directive-chip t-pixel"
              onClick={() => handlePreset(preset.id)}
              disabled={status === "sending"}
            >
              {preset.label}
            </button>
          ))}
        </fieldset>
      ) : null}

      <div className="hb-parent-chat-messages" ref={listRef}>
        {hydrateStatus === "loading" && messages.length === 0 ? (
          <p className="hb-parent-empty">Loading past directives...</p>
        ) : null}
        {hydrateStatus !== "loading" && messages.length === 0 ? (
          <p className="hb-parent-empty">
            No messages yet. Start a directive below and Bit will adjust for your kid's next
            sessions.
          </p>
        ) : null}
        {messages.map((m, idx) => {
          const isLastError = idx === messages.length - 1 && m.role === "bit" && m.kind === "error";
          return (
            <div
              key={m.id}
              className={`hb-parent-chat-msg hb-parent-chat-${m.role}${
                m.kind === "error" ? " hb-parent-chat-msg-error" : ""
              }`}
            >
              <div className="hb-parent-chat-msg-role t-pixel">
                {m.role === "parent" ? parentName : "Bit"}
              </div>
              <div className="hb-parent-chat-msg-body">{m.text}</div>
              {isLastError && canRetry ? (
                <button
                  type="button"
                  className="hb-btn hb-btn-ghost hb-parent-chat-retry"
                  onClick={handleRetry}
                >
                  Try again
                </button>
              ) : null}
            </div>
          );
        })}
        {status === "sending" ? (
          <div className="hb-parent-chat-msg hb-parent-chat-bit hb-parent-chat-msg-pending">
            <div className="hb-parent-chat-msg-role t-pixel">Bit</div>
            <div className="hb-parent-chat-msg-body hb-parent-chat-thinking">
              Bit is thinking...
            </div>
          </div>
        ) : null}
      </div>

      <form className="hb-parent-chat-input-row" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="hb-input hb-parent-chat-input"
          type="text"
          placeholder="message Bit as the parent..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status === "sending"}
        />
        <button type="submit" className="hb-btn hb-btn-primary" disabled={disabled}>
          {status === "sending" ? "Sending..." : "Send"}
        </button>
      </form>
    </section>
  );
}
