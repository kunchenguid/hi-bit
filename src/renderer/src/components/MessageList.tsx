import type { ChatMessage } from "@shared/chat";
import { MarkdownText } from "./MarkdownText";

type MessageListProps = {
  messages: ChatMessage[];
};

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="hb-empty-chat">
        <p className="t-small">
          Ask Bit to build a button, a tiny game, a fan page, or anything web-shaped.
        </p>
      </div>
    );
  }

  return (
    <ol className="hb-message-list" aria-label="Conversation">
      {messages.map((message) => (
        <li className={`hb-message hb-message-${message.role}`} key={message.id}>
          <span className="hb-message-label">{message.role === "user" ? "You" : "Bit"}</span>
          {message.role === "assistant" ? (
            <MarkdownText text={message.text} />
          ) : (
            <p>{message.text}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
