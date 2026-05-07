import type { SendMessageResult } from "@shared/chat";
import { isLearnerActivityType } from "@shared/learnerActivity";
import type { TranscriptEvent } from "@shared/transcript";
import { create } from "zustand";
import { buildKidChatHistory } from "./kidChatHistory";
import {
  buildLearnerActivityPrompt,
  type ExpectedLearnerAction,
  expectedLearnerActionLabel,
  inferExpectedLearnerAction,
  type LearnerActivity,
} from "./learnerActivity";
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
  pendingExpectedAction: ExpectedLearnerAction | null;
  hydrate: (profileId: string, sessionId: string) => Promise<void>;
  send: (
    profileId: string,
    prompt: string,
    options?: { uiContext?: string },
  ) => Promise<SendMessageResult | null>;
  sendSystemPrompt: (
    profileId: string,
    message: { prompt: string; label: string },
  ) => Promise<SendMessageResult | null>;
  sendLearnerActivity: (
    profileId: string,
    activity: LearnerActivity,
  ) => Promise<SendMessageResult | null>;
  expectLearnerAction: (action: ExpectedLearnerAction) => void;
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

export function trimVisibleAssistantText(text: string): string {
  return text.trimEnd();
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

function promptWithUiContext(prompt: string, uiContext?: string): string {
  const trimmedContext = uiContext?.trim();
  if (!trimmedContext) return prompt;
  return `<hi-bit:ui-context>\n${trimmedContext}\n</hi-bit:ui-context>\n\n${prompt}`;
}

function expectedActionFromResult(result: SendMessageResult): ExpectedLearnerAction | null {
  if (!result.ok) return null;
  const explicit = result.expectedActions?.at(-1);
  if (explicit) return { ...explicit, source: "explicit" };
  return inferExpectedLearnerAction(result.text);
}

function expectedActionFromTranscript(events: TranscriptEvent[]): ExpectedLearnerAction | null {
  for (const event of [...events].reverse()) {
    if (event.role !== "kid") continue;
    if (event.kind === "user_message") return null;
    if (event.kind !== "assistant_message") continue;
    const expectedActions = event.metadata?.expectedActions;
    if (Array.isArray(expectedActions)) {
      for (const action of [...expectedActions].reverse()) {
        if (!action || typeof action !== "object") continue;
        const input = action as { type?: unknown; label?: unknown };
        if (!isLearnerActivityType(input.type)) continue;
        return {
          type: input.type,
          source: "explicit",
          ...(typeof input.label === "string" && input.label.trim().length > 0
            ? { label: input.label.trim() }
            : {}),
        };
      }
    }
    return inferExpectedLearnerAction(event.text);
  }
  return null;
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
  pendingExpectedAction: null,

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
        pendingExpectedAction: expectedActionFromTranscript(transcript),
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
      pendingExpectedAction: inferExpectedLearnerAction(text),
    });
  },

  send: async (profileId, prompt, options) => {
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
      pendingExpectedAction: null,
    }));

    try {
      const result = await sendKidMessageWithTimeout(
        profileId,
        promptWithUiContext(trimmed, options?.uiContext),
        requestId,
      );
      const visibleText = result.ok ? trimVisibleAssistantText(result.text) : "";
      const blank = result.ok && isBlankAssistantText(visibleText);
      const reply: ChatMessage = {
        id: messageId(),
        role: "bit",
        kind: result.ok && !blank ? "text" : "error",
        text: result.ok ? (blank ? KID_EMPTY_REPLY : visibleText) : KID_FRIENDLY_ERROR,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, reply],
        status: "idle",
        error: result.ok ? (blank ? "Bit returned an empty reply" : null) : result.error,
        streamingText: null,
        activeRequestId: null,
        pendingExpectedAction: blank ? null : expectedActionFromResult(result),
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
        pendingExpectedAction: null,
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
      pendingExpectedAction: null,
    }));

    try {
      const result = await sendKidMessageWithTimeout(profileId, trimmed, requestId);
      const visibleText = result.ok ? trimVisibleAssistantText(result.text) : "";
      const blank = result.ok && isBlankAssistantText(visibleText);
      const reply: ChatMessage = {
        id: messageId(),
        role: "bit",
        kind: result.ok && !blank ? "text" : "error",
        text: result.ok ? (blank ? KID_EMPTY_REPLY : visibleText) : KID_FRIENDLY_ERROR,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, reply],
        status: "idle",
        error: result.ok ? (blank ? "Bit returned an empty reply" : null) : result.error,
        streamingText: null,
        activeRequestId: null,
        pendingExpectedAction: blank ? null : expectedActionFromResult(result),
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
        pendingExpectedAction: null,
      }));
      return null;
    }
  },

  sendLearnerActivity: async (profileId, activity) => {
    const state = get();
    if (state.status === "sending") return null;
    const expected = state.pendingExpectedAction;
    if (!expected || expected.type !== activity.type) return null;

    set({ pendingExpectedAction: null });
    return get().sendSystemPrompt(profileId, {
      label: expectedLearnerActionLabel(expected),
      prompt: buildLearnerActivityPrompt(activity),
    });
  },

  expectLearnerAction: (action) => {
    set((s) => {
      if (s.pendingExpectedAction?.source === "explicit") return {};
      return { pendingExpectedAction: action };
    });
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
      pendingExpectedAction: null,
    }));

    try {
      const result = await sendKidMessageWithTimeout(profileId, lastKid.text, requestId);
      const visibleText = result.ok ? trimVisibleAssistantText(result.text) : "";
      const blank = result.ok && isBlankAssistantText(visibleText);
      const reply: ChatMessage = {
        id: messageId(),
        role: "bit",
        kind: result.ok && !blank ? "text" : "error",
        text: result.ok ? (blank ? KID_EMPTY_REPLY : visibleText) : KID_FRIENDLY_ERROR,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({
        messages: [...s.messages, reply],
        status: "idle",
        error: result.ok ? (blank ? "Bit returned an empty reply" : null) : result.error,
        streamingText: null,
        activeRequestId: null,
        pendingExpectedAction: blank ? null : expectedActionFromResult(result),
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
        pendingExpectedAction: null,
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
      pendingExpectedAction: null,
    });
  },
}));
