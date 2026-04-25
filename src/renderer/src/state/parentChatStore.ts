import type { SendMessageResult } from "@shared/chat";
import { create } from "zustand";
import { buildParentChatHistory } from "./parentChatHistory";

export type ParentChatMessageRole = "parent" | "bit";
export type ParentChatMessageKind = "text" | "error";

export type ParentChatMessage = {
  id: string;
  role: ParentChatMessageRole;
  kind: ParentChatMessageKind;
  text: string;
  timestamp: string;
};

function messageId(): string {
  return crypto.randomUUID();
}

export type ParentChatStatus = "idle" | "sending";
export type ParentChatHydrateStatus = "idle" | "loading" | "ready" | "error";

export type ParentChatStore = {
  messages: ParentChatMessage[];
  status: ParentChatStatus;
  error: string | null;
  hydrateStatus: ParentChatHydrateStatus;
  hydrateError: string | null;
  hydratedSessionId: string | null;
  hydrate: (profileId: string, sessionId: string) => Promise<void>;
  send: (profileId: string, prompt: string) => Promise<SendMessageResult | null>;
  retry: (profileId: string) => Promise<SendMessageResult | null>;
  reset: () => void;
};

export function canRetryLastParentMessage(messages: ParentChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "bit" || last.kind !== "error") return false;
  return messages.some((m) => m.role === "parent" && m.kind === "text");
}

export const useParentChatStore = create<ParentChatStore>((set, get) => ({
  messages: [],
  status: "idle",
  error: null,
  hydrateStatus: "idle",
  hydrateError: null,
  hydratedSessionId: null,

  hydrate: async (profileId, sessionId) => {
    set({ hydrateStatus: "loading", hydrateError: null });
    try {
      const transcript = await window.hibit.getTranscript(profileId, sessionId);
      set({
        messages: buildParentChatHistory(transcript),
        hydrateStatus: "ready",
        hydratedSessionId: sessionId,
      });
    } catch (err) {
      set({
        hydrateStatus: "error",
        hydrateError: err instanceof Error ? err.message : "Failed to load parent chat history",
      });
    }
  },

  send: async (profileId, prompt) => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) return null;
    if (get().status === "sending") return null;

    const parentMessage: ParentChatMessage = {
      id: messageId(),
      role: "parent",
      kind: "text",
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      messages: [...s.messages, parentMessage],
      status: "sending",
      error: null,
    }));

    try {
      const result = await window.hibit.sendParentMessage(profileId, trimmed);
      const reply: ParentChatMessage = {
        id: messageId(),
        role: "bit",
        kind: result.ok ? "text" : "error",
        text: result.ok ? result.text : result.error,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, reply],
        status: "idle",
        error: result.ok ? null : result.error,
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
            text: message,
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
    if (!canRetryLastParentMessage(state.messages)) return null;
    const lastParent = [...state.messages]
      .reverse()
      .find((m) => m.role === "parent" && m.kind === "text");
    if (!lastParent) return null;

    set((s) => ({
      messages: s.messages.slice(0, -1),
      status: "sending",
      error: null,
    }));

    try {
      const result = await window.hibit.sendParentMessage(profileId, lastParent.text);
      const reply: ParentChatMessage = {
        id: messageId(),
        role: "bit",
        kind: result.ok ? "text" : "error",
        text: result.ok ? result.text : result.error,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, reply],
        status: "idle",
        error: result.ok ? null : result.error,
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
            text: message,
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
    });
  },
}));
