import type { ChatMessage } from "@shared/chat";

type MessageListProps = {
  messages: ChatMessage[];
};

export function MessageList({ messages }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="hb-empty-chat">
        <div className="hb-empty-chat-card">
          <p className="t-pixel">Start here</p>
          <h2>What should Bit build first?</h2>
          <p>Pick an idea, or ask in your own words.</p>
          <ul className="hb-starter-ideas" aria-label="Starter ideas">
            <li>Make it faster</li>
            <li>Add a timer</li>
            <li>Change the colors</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <ol className="hb-message-list" aria-label="Conversation">
      {messages.map((message) => (
        <li className={`hb-message hb-message-${message.role}`} key={message.id}>
          <span className="hb-message-label">{message.role === "user" ? "You" : "Bit"}</span>
          <p>{message.text}</p>
        </li>
      ))}
    </ol>
  );
}
