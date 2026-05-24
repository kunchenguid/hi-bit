import type { AuthStatus } from "@shared/auth";
import type { ChatEvent, ChatMessage, CreationActivity } from "@shared/chat";
import type { ProfileInput, ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { applyEventToActivity } from "./activity";
import { AuthGate } from "./screens/AuthGate";
import { ChatWorkspace } from "./screens/ChatWorkspace";
import { ProfileGate } from "./screens/ProfileGate";

type LoadState = "loading" | "ready" | "error";

export function App() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activity, setActivity] = useState<CreationActivity[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );

  const clearChatState = useCallback(() => {
    setMessages([]);
    setActivity([]);
    setShowActivity(false);
    setRunning(false);
  }, []);

  const loadProfileState = useCallback(async () => {
    const [nextProfiles, storedActiveProfileId] = await Promise.all([
      window.hibit.profiles.list(),
      window.hibit.profiles.getActiveId(),
    ]);
    setProfiles(nextProfiles);
    const nextActiveProfileId = nextProfiles.some((profile) => profile.id === storedActiveProfileId)
      ? storedActiveProfileId
      : null;
    setActiveProfileId(nextActiveProfileId);
    clearChatState();
  }, [clearChatState]);

  const refreshAuth = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    try {
      const status = await window.hibit.auth.status();
      setAuthStatus(status);
      if (status.authenticated) {
        await loadProfileState();
      }
      setLoadState("ready");
    } catch (caught) {
      setLoadState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [loadProfileState]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    if (!activeProfileId || !authStatus?.authenticated) return;
    let cancelled = false;
    void window.hibit.chat.load(activeProfileId).then((snapshot) => {
      if (cancelled) return;
      setMessages(snapshot.messages);
      setActivity(snapshot.activity);
      setRunning(snapshot.isRunning);
    });
    return () => {
      cancelled = true;
    };
  }, [activeProfileId, authStatus?.authenticated]);

  useEffect(() => {
    return window.hibit.chat.onEvent((event) => {
      if (event.profileId !== activeProfileId) return;
      applyChatEvent(event, setMessages, setActivity, setRunning, setError);
    });
  }, [activeProfileId]);

  const login = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const status = await window.hibit.auth.login();
      setAuthStatus(status);
      if (status.authenticated) {
        await loadProfileState();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [loadProfileState]);

  const createProfile = useCallback(
    async (input: ProfileInput) => {
      setBusy(true);
      setError(null);
      try {
        const profile = await window.hibit.profiles.create(input);
        await window.hibit.profiles.setActiveId(profile.id);
        setProfiles((current) =>
          [...current, profile].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        );
        clearChatState();
        setActiveProfileId(profile.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [clearChatState],
  );

  const selectProfile = useCallback(
    async (profile: ProfileSummary) => {
      setBusy(true);
      setError(null);
      try {
        await window.hibit.profiles.setActiveId(profile.id);
        clearChatState();
        setActiveProfileId(profile.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [clearChatState],
  );

  const switchProfile = useCallback(async () => {
    await window.hibit.profiles.setActiveId(null);
    setActiveProfileId(null);
    clearChatState();
  }, [clearChatState]);

  const updateProfile = useCallback(
    async (settings: ProfileSettingsInput) => {
      if (!activeProfile) return;
      setBusy(true);
      setError(null);
      try {
        const updated = await window.hibit.profiles.update(activeProfile.id, settings);
        setProfiles((current) =>
          current.map((profile) => (profile.id === updated.id ? updated : profile)),
        );
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [activeProfile],
  );

  const send = useCallback(async () => {
    if (!activeProfile) return;
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setError(null);
    setRunning(true);
    setMessages((current) => [
      ...current,
      {
        id: `local-user-${Date.now()}`,
        role: "user",
        text,
        createdAt: new Date().toISOString(),
      },
    ]);
    const result = await window.hibit.chat.send(activeProfile.id, text);
    if (!result.ok) {
      setRunning(false);
      setError(result.error);
    }
  }, [activeProfile, draft]);

  const abort = useCallback(async () => {
    if (!activeProfile) return;
    await window.hibit.chat.abort(activeProfile.id);
    setRunning(false);
  }, [activeProfile]);

  const openFolder = useCallback(() => {
    if (!activeProfile) return;
    void window.hibit.projects.openFolder(activeProfile.id).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [activeProfile]);

  if (loadState === "loading") {
    return (
      <main className="hb-shell hb-loading-shell">
        <p className="hb-gate-loading">Waking Bit up...</p>
      </main>
    );
  }

  if (loadState === "error" || !authStatus?.authenticated) {
    return <AuthGate status={authStatus} busy={busy} error={error} onLogin={login} />;
  }

  if (!activeProfile) {
    return (
      <ProfileGate
        profiles={profiles}
        busy={busy}
        error={error}
        onCreate={createProfile}
        onSelect={selectProfile}
      />
    );
  }

  return (
    <ChatWorkspace
      authStatus={authStatus}
      profile={activeProfile}
      messages={messages}
      activity={activity}
      showActivity={showActivity}
      draft={draft}
      running={running}
      busy={busy}
      error={error}
      onDraftChange={setDraft}
      onSend={send}
      onAbort={abort}
      onOpenFolder={openFolder}
      onSwitchProfile={switchProfile}
      onUpdateProfile={updateProfile}
      onShowActivity={() => setShowActivity(true)}
      onHideActivity={() => setShowActivity(false)}
    />
  );
}

function applyChatEvent(
  event: ChatEvent,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  setActivity: Dispatch<SetStateAction<CreationActivity[]>>,
  setRunning: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
): void {
  switch (event.type) {
    case "turn_start":
      setRunning(true);
      setError(null);
      break;
    case "assistant_delta":
      setMessages((current) => upsertAssistantDelta(current, event.turnId, event.text));
      break;
    case "build_start":
    case "build_end":
    case "tool_start":
    case "tool_update":
    case "tool_end":
      setActivity((current) => applyEventToActivity(current, event));
      break;
    case "turn_end":
      setRunning(false);
      if (event.status === "failed") {
        setError(event.error ?? "Bit hit a problem.");
      }
      break;
  }
}

function upsertAssistantDelta(
  messages: ChatMessage[],
  turnId: string,
  text: string,
): ChatMessage[] {
  const existing = messages.find((message) => message.id === `assistant-${turnId}`);
  if (!existing) {
    return [
      ...messages,
      { id: `assistant-${turnId}`, role: "assistant", text, createdAt: new Date().toISOString() },
    ];
  }
  return messages.map((message) =>
    message.id === existing.id ? { ...message, text: message.text + text } : message,
  );
}
