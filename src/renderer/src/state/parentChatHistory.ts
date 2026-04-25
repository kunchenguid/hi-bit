import type { TranscriptEvent } from "@shared/transcript";
import type { ParentChatMessage } from "./parentChatStore";

function toChatMessage(event: TranscriptEvent): ParentChatMessage | null {
  if (event.role !== "parent") return null;
  if (event.kind === "user_message") {
    return {
      id: `${event.timestamp}-u`,
      role: "parent",
      kind: "text",
      text: event.text,
      timestamp: event.timestamp,
    };
  }
  if (event.kind === "assistant_message") {
    return {
      id: `${event.timestamp}-a`,
      role: "bit",
      kind: "text",
      text: event.text,
      timestamp: event.timestamp,
    };
  }
  if (event.kind === "error") {
    return {
      id: `${event.timestamp}-e`,
      role: "bit",
      kind: "error",
      text: event.text,
      timestamp: event.timestamp,
    };
  }
  return null;
}

export function buildParentChatHistory(events: TranscriptEvent[]): ParentChatMessage[] {
  const messages: ParentChatMessage[] = [];
  for (const event of events) {
    const mapped = toChatMessage(event);
    if (mapped) messages.push(mapped);
  }
  return messages;
}
