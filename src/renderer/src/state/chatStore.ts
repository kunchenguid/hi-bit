import type { SendMessageResult } from "@shared/chat";
import { create } from "zustand";
import { buildKidChatHistory } from "./kidChatHistory";
import { useProgressStore } from "./progressStore";

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
  streamingText: string | null;
  activeRequestId: string | null;
  hydrate: (profileId: string, sessionId: string) => Promise<void>;
  send: (profileId: string, prompt: string) => Promise<SendMessageResult | null>;
  sendSystemPrompt: (
    profileId: string,
    message: { prompt: string; label: string },
  ) => Promise<SendMessageResult | null>;
  retry: (profileId: string) => Promise<SendMessageResult | null>;
  seedKidGreeting: (sessionId: string, text: string) => void;
  appendStreamingDelta: (requestId: string | null | undefined, text: string) => void;
  reset: () => void;
};

export function canRetryLastKidMessage(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "bit" || last.kind !== "error") return false;
  return messages.some((m) => m.role === "kid" && m.kind === "text");
}

export const KID_FRIENDLY_ERROR = "Bit went to grab a snack. Try again in a minute.";
export const KID_EMPTY_REPLY = "Bit got quiet there. Tap try again to wake him up.";
export const KID_REPLY_TIMEOUT_MS = 45_000;
const KID_CANCEL_ACK_TIMEOUT_MS = 3_000;
export const KID_REPLY_TIMEOUT_ERROR = "Bit timed out waiting for the agent harness";
export const KID_TIMEOUT_REPLY =
  "Bit is taking too long. Tap try again and we'll give it another shot.";

export function isBlankAssistantText(text: string): boolean {
  return text.trim().length === 0;
}

async function refreshLoadedProgress(profileId: string): Promise<void> {
  const progressState = useProgressStore.getState();
  if (progressState.profileId !== profileId) return;
  await progressState.load(profileId);
}

function friendlyErrorText(message: string): string {
  return /timed out/i.test(message) ? KID_TIMEOUT_REPLY : KID_FRIENDLY_ERROR;
}

async function waitForKidCancellationAck(requestId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      window.hibit.cancelKidMessage(requestId).catch(() => {}),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, KID_CANCEL_ACK_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendKidMessageWithTimeout(
  profileId: string,
  prompt: string,
  requestId: string,
): Promise<SendMessageResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sendPromise = window.hibit.sendKidMessage(profileId, prompt, requestId);
  try {
    const result = await Promise.race<SendMessageResult | "timeout">([
      sendPromise,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), KID_REPLY_TIMEOUT_MS);
      }),
    ]);
    if (result !== "timeout") return result;
    void sendPromise.catch(() => {});
    await waitForKidCancellationAck(requestId);
    throw new Error(KID_REPLY_TIMEOUT_ERROR);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  status: "idle",
  error: null,
  hydrateStatus: "idle",
  hydrateError: null,
  hydratedSessionId: null,
  greetingForSessionId: null,
  streamingText: null,
  activeRequestId: null,

  appendStreamingDelta: (requestId, text) =>
    set((s) => {
      if (!s.activeRequestId || requestId !== s.activeRequestId) return {};
      return { streamingText: (s.streamingText ?? "") + text };
    }),

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

    const requestId = messageId();
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
      streamingText: null,
      activeRequestId: requestId,
    }));

    try {
      const result = await sendKidMessageWithTimeout(profileId, trimmed, requestId);
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
        streamingText: null,
        activeRequestId: null,
      }));
      if (result.ok && !blank) await refreshLoadedProgress(profileId);
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
            text: friendlyErrorText(message),
            timestamp: new Date().toISOString(),
          },
        ],
        status: "idle",
        error: message,
        streamingText: null,
        activeRequestId: null,
      }));
      return null;
    }
  },

  sendSystemPrompt: async (profileId, message) => {
    const trimmed = message.prompt.trim();
    if (trimmed.length === 0) return null;
    if (get().status === "sending") return null;

    const requestId = messageId();
    const divider: ChatMessage = {
      id: messageId(),
      role: "system",
      kind: "divider",
      text: message.label,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      messages: [...s.messages, divider],
      status: "sending",
      error: null,
      streamingText: null,
      activeRequestId: requestId,
    }));

    try {
      const result = await sendKidMessageWithTimeout(profileId, trimmed, requestId);
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
        streamingText: null,
        activeRequestId: null,
      }));
      if (result.ok && !blank) await refreshLoadedProgress(profileId);
      return result;
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      set((s) => ({
        messages: [
          ...s.messages,
          {
            id: messageId(),
            role: "bit",
            kind: "error",
            text: friendlyErrorText(messageText),
            timestamp: new Date().toISOString(),
          },
        ],
        status: "idle",
        error: messageText,
        streamingText: null,
        activeRequestId: null,
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

    const requestId = messageId();
    set((s) => ({
      messages: s.messages.slice(0, -1),
      status: "sending",
      error: null,
      streamingText: null,
      activeRequestId: requestId,
    }));

    try {
      const result = await sendKidMessageWithTimeout(profileId, lastKid.text, requestId);
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
        streamingText: null,
        activeRequestId: null,
      }));
      if (result.ok && !blank) await refreshLoadedProgress(profileId);
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
            text: friendlyErrorText(message),
            timestamp: new Date().toISOString(),
          },
        ],
        status: "idle",
        error: message,
        streamingText: null,
        activeRequestId: null,
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
      streamingText: null,
      activeRequestId: null,
    });
  },
}));
