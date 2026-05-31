import type { AuthStatus } from "@shared/auth";
import type { ChatEvent, ChatSnapshot, PreviewInfo, SendMessageResult } from "@shared/chat";
import type { AppInfo, HiBitApi } from "@shared/ipc";
import type { ProfileInput, ProfileSettingsInput, ProfileSummary } from "@shared/profile";
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
  profiles: {
    list: (): Promise<ProfileSummary[]> => ipcRenderer.invoke("hibit:profiles:list"),
    create: (input: ProfileInput): Promise<ProfileSummary> =>
      ipcRenderer.invoke("hibit:profiles:create", input),
    update: (profileId: string, settings: ProfileSettingsInput): Promise<ProfileSummary> =>
      ipcRenderer.invoke("hibit:profiles:update", profileId, settings),
    getActiveId: (): Promise<string | null> => ipcRenderer.invoke("hibit:profiles:get-active-id"),
    setActiveId: (profileId: string | null): Promise<void> =>
      ipcRenderer.invoke("hibit:profiles:set-active-id", profileId),
  },
  projects: {
    list: (profileId: string): Promise<ProjectSummary[]> =>
      ipcRenderer.invoke("hibit:projects:list", profileId),
    create: (profileId: string, input: CreateProjectInput): Promise<ProjectSummary> =>
      ipcRenderer.invoke("hibit:projects:create", profileId, input),
    openFolder: (profileId: string): Promise<void> =>
      ipcRenderer.invoke("hibit:projects:open-folder", profileId),
  },
  chat: {
    load: (profileId: string): Promise<ChatSnapshot> =>
      ipcRenderer.invoke("hibit:chat:load", profileId),
    send: (profileId: string, text: string): Promise<SendMessageResult> =>
      ipcRenderer.invoke("hibit:chat:send", profileId, text),
    abort: (profileId: string): Promise<void> => ipcRenderer.invoke("hibit:chat:abort", profileId),
    markActivitiesOpened: (profileId: string): Promise<void> =>
      ipcRenderer.invoke("hibit:chat:mark-activities-opened", profileId),
    onEvent: (listener: (event: ChatEvent) => void): (() => void) => {
      const handler = (_event: unknown, payload: ChatEvent) => listener(payload);
      ipcRenderer.on("hibit:chat:event", handler);
      return () => ipcRenderer.off("hibit:chat:event", handler);
    },
  },
  preview: {
    play: (profileId: string, projectId: string): Promise<PreviewInfo> =>
      ipcRenderer.invoke("hibit:preview:play", profileId, projectId),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke("hibit:preview:open-external", url),
    clearCache: (): Promise<void> => ipcRenderer.invoke("hibit:preview:clear-cache"),
  },
};

contextBridge.exposeInMainWorld("hibit", api);
