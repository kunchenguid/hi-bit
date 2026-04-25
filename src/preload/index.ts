import type { SendMessageResult } from "@shared/chat";
import type { HarnessDetection, HiBitConfig } from "@shared/config";
import type { DreamValidation } from "@shared/dreams";
import type { ParentFlag } from "@shared/flag";
import type {
  AppInfo,
  BitDeltaEvent,
  HiBitApi,
  OpenProjectFolderResult,
  ProjectFileSubscription,
} from "@shared/ipc";
import type { KnowledgeGraphValidation } from "@shared/knowledgeGraph";
import type { Profile, ProfileInput, ProfileSettingsInput } from "@shared/profile";
import type { KnowledgePointStatus, Progress } from "@shared/progress";
import type { ProjectFile, ProjectFileChange } from "@shared/project";
import type { HarnessInvocationLogEntry } from "@shared/sessionLog";
import type { TranscriptEvent } from "@shared/transcript";
import { contextBridge, ipcRenderer } from "electron";

const api: HiBitApi = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke("hibit:get-app-info"),
  listProfiles: (): Promise<Profile[]> => ipcRenderer.invoke("hibit:list-profiles"),
  createProfile: (input: ProfileInput): Promise<Profile> =>
    ipcRenderer.invoke("hibit:create-profile", input),
  deleteProfile: (profileId: string): Promise<void> =>
    ipcRenderer.invoke("hibit:delete-profile", profileId),
  exportProfile: (profileId: string): Promise<string | null> =>
    ipcRenderer.invoke("hibit:export-profile", profileId),
  getConfig: (): Promise<HiBitConfig> => ipcRenderer.invoke("hibit:get-config"),
  updateConfig: (config: HiBitConfig): Promise<HiBitConfig> =>
    ipcRenderer.invoke("hibit:update-config", config),
  detectHarnesses: (): Promise<HarnessDetection> => ipcRenderer.invoke("hibit:detect-harnesses"),
  getKnowledgeGraph: (): Promise<KnowledgeGraphValidation> =>
    ipcRenderer.invoke("hibit:get-knowledge-graph"),
  getDreams: (): Promise<DreamValidation> => ipcRenderer.invoke("hibit:get-dreams"),
  setCurrentDream: (profileId: string, dreamId: string): Promise<Profile> =>
    ipcRenderer.invoke("hibit:set-current-dream", profileId, dreamId),
  updateProfileSettings: (profileId: string, settings: ProfileSettingsInput): Promise<Profile> =>
    ipcRenderer.invoke("hibit:update-profile-settings", profileId, settings),
  sendKidMessage: (profileId: string, prompt: string): Promise<SendMessageResult> =>
    ipcRenderer.invoke("hibit:send-kid-message", profileId, prompt),
  sendParentMessage: (profileId: string, prompt: string): Promise<SendMessageResult> =>
    ipcRenderer.invoke("hibit:send-parent-message", profileId, prompt),
  onBitDelta: (handler: (event: BitDeltaEvent) => void): (() => void) => {
    const listener = (_e: unknown, payload: BitDeltaEvent) => handler(payload);
    ipcRenderer.on("hibit:bit-delta", listener);
    return () => {
      ipcRenderer.off("hibit:bit-delta", listener);
    };
  },
  listProjectSlugs: (profileId: string): Promise<string[]> =>
    ipcRenderer.invoke("hibit:list-project-slugs", profileId),
  listProjectFiles: (profileId: string, slug: string): Promise<string[]> =>
    ipcRenderer.invoke("hibit:list-project-files", profileId, slug),
  readProjectFile: (profileId: string, slug: string, filename: string): Promise<ProjectFile> =>
    ipcRenderer.invoke("hibit:read-project-file", profileId, slug, filename),
  writeProjectFile: (
    profileId: string,
    slug: string,
    filename: string,
    content: string,
  ): Promise<void> =>
    ipcRenderer.invoke("hibit:write-project-file", profileId, slug, filename, content),
  openProjectFolder: (profileId: string, slug: string): Promise<OpenProjectFolderResult> =>
    ipcRenderer.invoke("hibit:open-project-folder", profileId, slug),
  subscribeProjectFiles: async (
    profileId: string,
    slug: string,
    onChange: (change: ProjectFileChange) => void,
  ): Promise<ProjectFileSubscription> => {
    const id = (await ipcRenderer.invoke("hibit:watch-project-files", profileId, slug)) as number;
    const channel = `hibit:project-file-changed:${id}`;
    const listener = (_event: unknown, change: ProjectFileChange) => {
      onChange(change);
    };
    ipcRenderer.on(channel, listener);
    return {
      id,
      close: async () => {
        ipcRenderer.off(channel, listener);
        await ipcRenderer.invoke("hibit:unwatch-project-files", id);
      },
    };
  },
  getProgress: (profileId: string): Promise<Progress> =>
    ipcRenderer.invoke("hibit:get-progress", profileId),
  updateKpStatus: (
    profileId: string,
    kpId: string,
    status: KnowledgePointStatus | null,
    evidence?: string,
  ): Promise<Progress> =>
    ipcRenderer.invoke("hibit:update-kp-status", profileId, kpId, status, evidence),
  updateKpSkipped: (profileId: string, kpId: string, skipped: boolean): Promise<Progress> =>
    ipcRenderer.invoke("hibit:update-kp-skipped", profileId, kpId, skipped),
  getSessionLog: (profileId: string): Promise<HarnessInvocationLogEntry[]> =>
    ipcRenderer.invoke("hibit:get-session-log", profileId),
  getTranscript: (profileId: string, sessionId: string): Promise<TranscriptEvent[]> =>
    ipcRenderer.invoke("hibit:get-transcript", profileId, sessionId),
  hasParentPin: (): Promise<boolean> => ipcRenderer.invoke("hibit:has-parent-pin"),
  setParentPin: (pin: string): Promise<void> => ipcRenderer.invoke("hibit:set-parent-pin", pin),
  verifyParentPin: (pin: string): Promise<boolean> =>
    ipcRenderer.invoke("hibit:verify-parent-pin", pin),
  clearParentPin: (): Promise<void> => ipcRenderer.invoke("hibit:clear-parent-pin"),
  listFlags: (profileId: string): Promise<ParentFlag[]> =>
    ipcRenderer.invoke("hibit:list-flags", profileId),
  writeFlag: (profileId: string, flag: ParentFlag): Promise<string> =>
    ipcRenderer.invoke("hibit:write-flag", profileId, flag),
  deleteFlag: (profileId: string, flag: ParentFlag): Promise<void> =>
    ipcRenderer.invoke("hibit:delete-flag", profileId, flag),
};

contextBridge.exposeInMainWorld("hibit", api);
