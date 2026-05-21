import type { AuthStatus } from "@shared/auth";
import type { ChatEvent, ChatMessage, ToolActivity } from "@shared/chat";
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
import { ProjectPicker } from "./screens/ProjectPicker";

type LoadState = "loading" | "ready" | "error";

export function App() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolActivity[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  );

  const loadProjects = useCallback(async () => {
    const nextProjects = await window.hibit.projects.list();
    setProjects(nextProjects);
    setActiveProjectId((current) => current ?? nextProjects[0]?.id ?? null);
  }, []);

  const refreshAuth = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    try {
      const status = await window.hibit.auth.status();
      setAuthStatus(status);
      if (status.authenticated) {
        await loadProjects();
      }
      setLoadState("ready");
    } catch (caught) {
      setLoadState("error");
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, [loadProjects]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    if (!activeProjectId || !authStatus?.authenticated) return;
    let cancelled = false;
    void window.hibit.chat.load(activeProjectId).then((snapshot) => {
      if (cancelled) return;
      setMessages(snapshot.messages);
      setTools(snapshot.tools);
      setRunning(snapshot.isRunning);
    });
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, authStatus?.authenticated]);

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
        await loadProjects();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [loadProjects]);

  const logout = useCallback(async () => {
    await window.hibit.auth.logout();
    setAuthStatus({
      authenticated: false,
      storage: authStatus?.storage ?? { path: "", encrypted: false },
    });
    setProjects([]);
    setActiveProjectId(null);
    setMessages([]);
    setTools([]);
  }, [authStatus?.storage]);

  const createProject = useCallback(async (title: string) => {
    setBusy(true);
    setError(null);
    try {
      const project = await window.hibit.projects.create({ title });
      const nextProjects = await window.hibit.projects.list();
      setProjects(nextProjects);
      setActiveProjectId(project.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  const send = useCallback(async () => {
    if (!activeProject) return;
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
    const result = await window.hibit.chat.send(activeProject.id, text);
    if (!result.ok) {
      setRunning(false);
      setError(result.error);
    }
  }, [activeProject, draft]);

  const abort = useCallback(async () => {
    if (!activeProject) return;
    await window.hibit.chat.abort(activeProject.id);
    setRunning(false);
  }, [activeProject]);

  const openFolder = useCallback(() => {
    if (!activeProject) return;
    void window.hibit.projects.openFolder(activeProject.id).catch((caught) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [activeProject]);

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

  if (!activeProject) {
    return (
      <ProjectPicker
        projects={projects}
        busy={busy}
        onCreate={createProject}
        onOpen={(project) => setActiveProjectId(project.id)}
        onLogout={logout}
      />
    );
  }

  return (
    <ChatWorkspace
      authStatus={authStatus}
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
  const id = `assistant-${turnId}`;
  const existing = messages.find((message) => message.id === id);
  if (!existing) {
    return [...messages, { id, role: "assistant", text, createdAt: new Date().toISOString() }];
  }
  return messages.map((message) =>
    message.id === id ? { ...message, text: `${message.text}${text}` } : message,
  );
}
