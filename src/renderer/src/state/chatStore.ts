import type { SendMessageResult } from "@shared/chat";
import { create } from "zustand";
import { buildKidChatHistory } from "./kidChatHistory";

export type ChatMessageRole = "kid" | "bit" | "system";
export type ChatMessageKind = "text" | "error" | "divider";

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  kind: ChatMessageKind;
  text: string;
  timestamp: string;
};

function messageId(): string {
  return crypto.randomUUID();
}

export type ChatStatus = "idle" | "sending";
export type ChatHydrateStatus = "idle" | "loading" | "ready" | "error";

export type ChatStore = {
  messages: ChatMessage[];
  status: ChatStatus;
  error: string | null;
  hydrateStatus: ChatHydrateStatus;
  hydrateError: string | null;
  hydratedSessionId: string | null;
  greetingForSessionId: string | null;
  hydrate: (profileId: string, sessionId: string) => Promise<void>;
  send: (profileId: string, prompt: string) => Promise<SendMessageResult | null>;
  retry: (profileId: string) => Promise<SendMessageResult | null>;
  seedKidGreeting: (sessionId: string, text: string) => void;
  reset: () => void;
};

export function canRetryLastKidMessage(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "bit" || last.kind !== "error") return false;
  return messages.some((m) => m.role === "kid" && m.kind === "text");
}

export const KID_FRIENDLY_ERROR = "Bit went to grab a snack. Try again in a minute.";
export const KID_EMPTY_REPLY = "Bit got quiet there. Tap try again to wake him up.";

export function isBlankAssistantText(text: string): boolean {
  return text.trim().length === 0;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  status: "idle",
  error: null,
  hydrateStatus: "idle",
  hydrateError: null,
  hydratedSessionId: null,
  greetingForSessionId: null,

  hydrate: async (profileId, sessionId) => {
    set({ hydrateStatus: "loading", hydrateError: null });
    try {
      const transcript = await window.hibit.getTranscript(profileId, sessionId);
      set({
        messages: buildKidChatHistory(transcript),
        hydrateStatus: "ready",
        hydratedSessionId: sessionId,
        greetingForSessionId: null,
      });
    } catch (err) {
      set({
        hydrateStatus: "error",
        hydrateError: err instanceof Error ? err.message : "Failed to load kid chat history",
      });
    }
  },

  seedKidGreeting: (sessionId, text) => {
    const state = get();
    if (state.hydratedSessionId !== sessionId) return;
    if (state.greetingForSessionId === sessionId) return;
    if (state.messages.length > 0) return;
    const greeting: ChatMessage = {
      id: messageId(),
      role: "bit",
      kind: "text",
      text,
      timestamp: new Date().toISOString(),
    };
    set({
      messages: [greeting],
      greetingForSessionId: sessionId,
    });
  },

  send: async (profileId, prompt) => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return null;
    if (get().status === "sending") return null;

    const kidMessage: ChatMessage = {
      id: messageId(),
      role: "kid",
      kind: "text",
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      messages: [...s.messages, kidMessage],
      status: "sending",
      error: null,
    }));

    try {
      const result = await window.hibit.sendKidMessage(profileId, trimmed);
      const blank = result.ok && isBlankAssistantText(result.text);
      const reply: ChatMessage = {
        id: messageId(),
        role: "bit",
        kind: result.ok && !blank ? "text" : "error",
        text: result.ok ? (blank ? KID_EMPTY_REPLY : result.text) : KID_FRIENDLY_ERROR,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, reply],
        status: "idle",
        error: result.ok ? (blank ? "Bit returned an empty reply" : null) : result.error,
      }));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: messageId(),
            role: "bit",
            kind: "error",
            text: KID_FRIENDLY_ERROR,
            timestamp: new Date().toISOString(),
          },
        ],
        status: "idle",
        error: message,
      }));
      return null;
    }
  },

  retry: async (profileId) => {
    const state = get();
    if (state.status === "sending") return null;
    if (!canRetryLastKidMessage(state.messages)) return null;
    const lastKid = [...state.messages]
      .reverse()
      .find((m) => m.role === "kid" && m.kind === "text");
    if (!lastKid) return null;

    set((s) => ({
      messages: s.messages.slice(0, -1),
      status: "sending",
      error: null,
    }));

    try {
      const result = await window.hibit.sendKidMessage(profileId, lastKid.text);
      const blank = result.ok && isBlankAssistantText(result.text);
      const reply: ChatMessage = {
        id: messageId(),
        role: "bit",
        kind: result.ok && !blank ? "text" : "error",
        text: result.ok ? (blank ? KID_EMPTY_REPLY : result.text) : KID_FRIENDLY_ERROR,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, reply],
        status: "idle",
        error: result.ok ? (blank ? "Bit returned an empty reply" : null) : result.error,
      }));
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: messageId(),
            role: "bit",
            kind: "error",
            text: KID_FRIENDLY_ERROR,
            timestamp: new Date().toISOString(),
          },
        ],
        status: "idle",
        error: message,
      }));
      return null;
    }
  },

  reset: () => {
    set({
      messages: [],
      status: "idle",
      error: null,
      hydrateStatus: "idle",
      hydrateError: null,
      hydratedSessionId: null,
      greetingForSessionId: null,
    });
  },
}));
