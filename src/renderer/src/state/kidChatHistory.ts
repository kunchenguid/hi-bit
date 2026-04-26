import type { TranscriptEvent } from "@shared/transcript";
import {
  type ChatMessage,
  isBlankAssistantText,
  KID_EMPTY_REPLY,
  KID_FRIENDLY_ERROR,
} from "./chatStore";
import { savedFilePromptLabel } from "./saveReaction";

function toChatMessage(event: TranscriptEvent): ChatMessage | null {
  if (event.role !== "kid") return null;
  if (event.kind === "user_message") {
    const savedLabel = savedFilePromptLabel(event.text);
    if (savedLabel) {
      return {
        id: `${event.timestamp}-s`,
        role: "system",
        kind: "divider",
        text: savedLabel,
        timestamp: event.timestamp,
      };
    }
    return {
      id: `${event.timestamp}-u`,
      role: "kid",
      kind: "text",
      text: event.text,
      timestamp: event.timestamp,
    };
  }
  if (event.kind === "assistant_message") {
    const blank = isBlankAssistantText(event.text);
    return {
      id: `${event.timestamp}-a`,
      role: "bit",
      kind: blank ? "error" : "text",
      text: blank ? KID_EMPTY_REPLY : event.text,
      timestamp: event.timestamp,
    };
  }
  if (event.kind === "error") {
    return {
      id: `${event.timestamp}-e`,
      role: "bit",
      kind: "error",
      text: KID_FRIENDLY_ERROR,
      timestamp: event.timestamp,
    };
  }
  if (event.kind === "system_event") {
    if (event.text.trim().length === 0) return null;
    return {
      id: `${event.timestamp}-s`,
      role: "system",
      kind: "divider",
      text: event.text,
      timestamp: event.timestamp,
    };
  }
  return null;
}

export function buildKidChatHistory(events: TranscriptEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const event of events) {
    const mapped = toChatMessage(event);
    if (mapped) messages.push(mapped);
  }
  return messages;
}
