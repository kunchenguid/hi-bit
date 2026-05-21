import type { AuthStatus } from "@shared/auth";
import type { ChatEvent, ChatSnapshot, SendMessageResult } from "@shared/chat";
import type { AppInfo, HiBitApi } from "@shared/ipc";
import type { CreateProjectInput, ProjectSummary } from "@shared/project";
import { contextBridge, ipcRenderer } from "electron";

const api: HiBitApi = {
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke("hibit:app:info"),
  },
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke("hibit:auth:status"),
    login: (): Promise<AuthStatus> => ipcRenderer.invoke("hibit:auth:login"),
    logout: (): Promise<void> => ipcRenderer.invoke("hibit:auth:logout"),
  },
  projects: {
    list: (): Promise<ProjectSummary[]> => ipcRenderer.invoke("hibit:projects:list"),
    create: (input: CreateProjectInput): Promise<ProjectSummary> =>
      ipcRenderer.invoke("hibit:projects:create", input),
    openFolder: (projectId: string): Promise<void> =>
      ipcRenderer.invoke("hibit:projects:open-folder", projectId),
  },
  chat: {
    load: (projectId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("hibit:chat:load", projectId),
    send: (projectId: string, text: string): Promise<SendMessageResult> =>
      ipcRenderer.invoke("hibit:chat:send", projectId, text),
    abort: (projectId: string): Promise<void> => ipcRenderer.invoke("hibit:chat:abort", projectId),
    onEvent: (listener: (event: ChatEvent) => void): (() => void) => {
      const handler = (_event: unknown, payload: ChatEvent) => listener(payload);
      ipcRenderer.on("hibit:chat:event", handler);
      return () => ipcRenderer.off("hibit:chat:event", handler);
    },
  },
};

contextBridge.exposeInMainWorld("hibit", api);
