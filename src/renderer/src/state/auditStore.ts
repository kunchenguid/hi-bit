import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import type { TranscriptEvent } from "@shared/transcript";
import { create } from "zustand";

export type AuditStoreStatus = "idle" | "loading" | "ready" | "error";
export type TranscriptStatus = "idle" | "loading" | "ready" | "error";

export type AuditStore = {
  profileId: string | null;
  sessions: HarnessInvocationLogEntry[];
  status: AuditStoreStatus;
  error: string | null;
  activeSessionId: string | null;
  transcript: TranscriptEvent[];
  transcriptStatus: TranscriptStatus;
  transcriptError: string | null;
  loadSessions: (profileId: string) => Promise<void>;
  loadTranscript: (profileId: string, sessionId: string) => Promise<void>;
  clearTranscript: () => void;
  reset: () => void;
};

export const useAuditStore = create<AuditStore>((set, get) => ({
  profileId: null,
  sessions: [],
  status: "idle",
  error: null,
  activeSessionId: null,
  transcript: [],
  transcriptStatus: "idle",
  transcriptError: null,

  loadSessions: async (profileId: string) => {
    if (get().status === "loading" && get().profileId === profileId) return;
    set({ status: "loading", error: null, profileId });
    try {
      const sessions = await window.hibit.getSessionLog(profileId);
      set({ sessions, status: "ready" });
    } catch (err) {
      set({
        status: "error",
        sessions: [],
        error: err instanceof Error ? err.message : "Failed to load sessions",
      });
    }
  },

  loadTranscript: async (profileId: string, sessionId: string) => {
    set({
      activeSessionId: sessionId,
      transcriptStatus: "loading",
      transcriptError: null,
      transcript: [],
    });
    try {
      const transcript = await window.hibit.getTranscript(profileId, sessionId);
      set({ transcript, transcriptStatus: "ready" });
    } catch (err) {
      set({
        transcriptStatus: "error",
        transcript: [],
        transcriptError: err instanceof Error ? err.message : "Failed to load transcript",
      });
    }
  },

  clearTranscript: () => {
    set({
      activeSessionId: null,
      transcript: [],
      transcriptStatus: "idle",
      transcriptError: null,
    });
  },

  reset: () => {
    set({
      profileId: null,
      sessions: [],
      status: "idle",
      error: null,
      activeSessionId: null,
      transcript: [],
      transcriptStatus: "idle",
      transcriptError: null,
    });
  },
}));
