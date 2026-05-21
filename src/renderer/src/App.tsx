import type { AuthStatus } from "@shared/auth";
import type { ChatEvent, ChatMessage, ToolActivity } from "@shared/chat";
import type { ProfileInput, ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import type { ProjectSummary } from "@shared/project";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AuthGate } from "./screens/AuthGate";
import { ChatWorkspace } from "./screens/ChatWorkspace";
import { ProfileGate } from "./screens/ProfileGate";
import { ProjectPicker } from "./screens/ProjectPicker";

type LoadState = "loading" | "ready" | "error";

export function App() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const clearProjectState = useCallback(() => {
    setProjects([]);
    setActiveProjectId(null);
    setMessages([]);
    setTools([]);
    setRunning(false);
  }, []);

  const loadProjects = useCallback(async (profileId: string) => {
    const nextProjects = await window.hibit.projects.list(profileId);
    setProjects(nextProjects);
    setActiveProjectId((current) =>
      current && nextProjects.some((project) => project.id === current)
        ? current
        : (nextProjects[0]?.id ?? null),
    );
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
    if (nextActiveProfileId) {
      await loadProjects(nextActiveProfileId);
    } else {
      clearProjectState();
    }
  }, [clearProjectState, loadProjects]);

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
    if (!activeProjectId || !activeProfileId || !authStatus?.authenticated) return;
    let cancelled = false;
    void window.hibit.chat.load(activeProfileId, activeProjectId).then((snapshot) => {
      if (cancelled) return;
      setMessages(snapshot.messages);
      setTools(snapshot.tools);
      setRunning(snapshot.isRunning);
    });
    return () => {
      cancelled = true;
    };
  }, [activeProfileId, activeProjectId, authStatus?.authenticated]);

  useEffect(() => {
    return window.hibit.chat.onEvent((event) => {
      if (event.projectId !== activeProjectId) return;
      applyChatEvent(event, setMessages, setTools, setRunning, setError);
    });
  }, [activeProjectId]);

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

  const logout = useCallback(async () => {
    await window.hibit.auth.logout();
    setAuthStatus({
      authenticated: false,
      storage: authStatus?.storage ?? { path: "", encrypted: false },
    });
    setProfiles([]);
    setActiveProfileId(null);
    clearProjectState();
  }, [authStatus?.storage, clearProjectState]);

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
        setActiveProfileId(profile.id);
        await loadProjects(profile.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [loadProjects],
  );

  const selectProfile = useCallback(
    async (profile: ProfileSummary) => {
      setBusy(true);
      setError(null);
      try {
        await window.hibit.profiles.setActiveId(profile.id);
        setActiveProfileId(profile.id);
        setMessages([]);
        setTools([]);
        await loadProjects(profile.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [loadProjects],
  );

  const switchProfile = useCallback(async () => {
    await window.hibit.profiles.setActiveId(null);
    setActiveProfileId(null);
    clearProjectState();
  }, [clearProjectState]);

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

  const createProject = useCallback(
    async (title: string) => {
      if (!activeProfile) return;
      setBusy(true);
      setError(null);
      try {
        const project = await window.hibit.projects.create(activeProfile.id, { title });
        const nextProjects = await window.hibit.projects.list(activeProfile.id);
        setProjects(nextProjects);
        setActiveProjectId(project.id);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setBusy(false);
      }
    },
    [activeProfile],
  );

  const send = useCallback(async () => {
    if (!activeProfile || !activeProject) return;
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
    const result = await window.hibit.chat.send(activeProfile.id, activeProject.id, text);
    if (!result.ok) {
      setRunning(false);
      setError(result.error);
    }
  }, [activeProfile, activeProject, draft]);

  const abort = useCallback(async () => {
    if (!activeProfile || !activeProject) return;
    await window.hibit.chat.abort(activeProfile.id, activeProject.id);
    setRunning(false);
  }, [activeProfile, activeProject]);

  const openFolder = useCallback(() => {
    if (!activeProfile || !activeProject) return;
    void window.hibit.projects.openFolder(activeProfile.id, activeProject.id).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [activeProfile, activeProject]);

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
        onLogout={logout}
      />
    );
  }

  if (!activeProject) {
    return (
      <ProjectPicker
        profile={activeProfile}
        projects={projects}
        busy={busy}
        error={error}
        onCreate={createProject}
        onOpen={(project) => setActiveProjectId(project.id)}
        onLogout={logout}
        onSwitchProfile={switchProfile}
        onUpdateProfile={updateProfile}
      />
    );
  }

  return (
    <ChatWorkspace
      authStatus={authStatus}
      profile={activeProfile}
      project={activeProject}
      messages={messages}
      tools={tools}
      draft={draft}
      running={running}
      error={error}
      onDraftChange={setDraft}
      onSend={send}
      onAbort={abort}
      onBack={() => setActiveProjectId(null)}
      onOpenFolder={openFolder}
      onLogout={logout}
      onSwitchProfile={switchProfile}
    />
  );
}

function applyChatEvent(
  event: ChatEvent,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>,
  setTools: Dispatch<SetStateAction<ToolActivity[]>>,
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
    case "tool_start":
      setTools((current) => [
        ...current.filter((tool) => tool.callId !== event.callId),
        {
          callId: event.callId,
          toolName: event.toolName,
          status: "running",
          args: event.args,
          content: [],
        },
      ]);
      break;
    case "tool_update":
      setTools((current) =>
        current.map((tool) =>
          tool.callId === event.callId ? { ...tool, content: event.content } : tool,
        ),
      );
      break;
    case "tool_end":
      setTools((current) =>
        current.map((tool) =>
          tool.callId === event.callId
            ? { ...tool, status: event.isError ? "failed" : "completed", content: event.content }
            : tool,
        ),
      );
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
