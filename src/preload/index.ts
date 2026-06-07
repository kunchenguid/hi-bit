import type { AuthStatus } from "@shared/auth";
import type { BrowserState, BrowserTab, SpotlightRect } from "@shared/browser";
import type {
  ChatEvent,
  ChatSnapshot,
  OutgoingImage,
  PreviewInfo,
  SendMessageResult,
} from "@shared/chat";
import type { AppInfo, HiBitApi, UpdateStatus } from "@shared/ipc";
import type { ProfileInput, ProfileSettingsInput, ProfileSummary } from "@shared/profile";
import type { CreateProjectInput, ProjectSummary } from "@shared/project";
import type { VoiceDownloadProgress, VoiceStatus } from "@shared/voice";
import { contextBridge, ipcRenderer } from "electron";

const api: HiBitApi = {
  app: {
    info: (): Promise<AppInfo> => ipcRenderer.invoke("hibit:app:info"),
    getUpdateStatus: (): Promise<UpdateStatus> => ipcRenderer.invoke("hibit:app:get-update-status"),
    openReleasePage: (): Promise<void> => ipcRenderer.invoke("hibit:app:open-release-page"),
  },
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke("hibit:auth:status"),
    login: (): Promise<AuthStatus> => ipcRenderer.invoke("hibit:auth:login"),
    logout: (): Promise<void> => ipcRenderer.invoke("hibit:auth:logout"),
    onReconnectRequired: (listener: () => void): (() => void) => {
      const handler = () => listener();
      ipcRenderer.on("hibit:auth:reconnect-required", handler);
      return () => ipcRenderer.off("hibit:auth:reconnect-required", handler);
    },
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
    send: (profileId: string, text: string, image?: OutgoingImage): Promise<SendMessageResult> =>
      ipcRenderer.invoke("hibit:chat:send", profileId, text, image),
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
  browser: {
    state: (): Promise<BrowserState> => ipcRenderer.invoke("hibit:browser:state"),
    open: (url?: string): Promise<BrowserTab> => ipcRenderer.invoke("hibit:browser:open", url),
    close: (tabId: string): Promise<void> => ipcRenderer.invoke("hibit:browser:close", tabId),
    switch: (tabId: string): Promise<void> => ipcRenderer.invoke("hibit:browser:switch", tabId),
    navigate: (url: string): Promise<void> => ipcRenderer.invoke("hibit:browser:navigate", url),
    reload: (): Promise<void> => ipcRenderer.invoke("hibit:browser:reload"),
    reportTabLoaded: (tabId: string, url: string, title?: string): void =>
      ipcRenderer.send("hibit:browser:tab-loaded", tabId, url, title),
    onState: (listener: (state: BrowserState) => void): (() => void) => {
      const handler = (_event: unknown, payload: BrowserState) => listener(payload);
      ipcRenderer.on("hibit:browser:state", handler);
      return () => ipcRenderer.off("hibit:browser:state", handler);
    },
    onSpotlight: (listener: (rect: SpotlightRect | null) => void): (() => void) => {
      const handler = (_event: unknown, payload: SpotlightRect | null) => listener(payload);
      ipcRenderer.on("hibit:browser:spotlight", handler);
      return () => ipcRenderer.off("hibit:browser:spotlight", handler);
    },
  },
  voice: {
    status: (): Promise<VoiceStatus> => ipcRenderer.invoke("hibit:voice:status"),
    ensureModel: (): Promise<void> => ipcRenderer.invoke("hibit:voice:ensure-model"),
    onDownloadProgress: (listener: (progress: VoiceDownloadProgress) => void): (() => void) => {
      const handler = (_event: unknown, payload: VoiceDownloadProgress) => listener(payload);
      ipcRenderer.on("hibit:voice:download-progress", handler);
      return () => ipcRenderer.off("hibit:voice:download-progress", handler);
    },
  },
};

contextBridge.exposeInMainWorld("hibit", api);
