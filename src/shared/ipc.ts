import type { SendMessageResult } from "./chat";
import type { HarnessDetection, HiBitConfig } from "./config";
import type { DreamValidation } from "./dreams";
import type { ParentFlag } from "./flag";
import type { KnowledgeGraphValidation } from "./knowledgeGraph";
import type { Profile, ProfileInput, ProfileSettingsInput } from "./profile";
import type { KnowledgePointStatus, Progress } from "./progress";
import type { ProjectFile, ProjectFileChange } from "./project";
import type { HarnessInvocationLogEntry, SessionRole } from "./sessionLog";
import type { TranscriptEvent } from "./transcript";

export type BitDeltaEvent = {
  role: SessionRole;
  profileId: string;
  text: string;
};

export type Platform =
  | "darwin"
  | "win32"
  | "linux"
  | "aix"
  | "freebsd"
  | "openbsd"
  | "sunos"
  | "android"
  | "cygwin"
  | "netbsd";

export type AppInfo = {
  version: string;
  platform: Platform;
  userDataDir: string;
  hiBitDir: string;
};

export type ProjectFileSubscription = {
  id: number;
  close: () => Promise<void>;
};

export type OpenProjectFolderResult =
  | { ok: true; path: string }
  | { ok: false; path: string; error: string };

export type HiBitApi = {
  getAppInfo: () => Promise<AppInfo>;
  listProfiles: () => Promise<Profile[]>;
  createProfile: (input: ProfileInput) => Promise<Profile>;
  deleteProfile: (profileId: string) => Promise<void>;
  exportProfile: (profileId: string) => Promise<string | null>;
  getConfig: () => Promise<HiBitConfig>;
  updateConfig: (config: HiBitConfig) => Promise<HiBitConfig>;
  detectHarnesses: () => Promise<HarnessDetection>;
  getKnowledgeGraph: () => Promise<KnowledgeGraphValidation>;
  getDreams: () => Promise<DreamValidation>;
  setCurrentDream: (profileId: string, dreamId: string) => Promise<Profile>;
  updateProfileSettings: (profileId: string, settings: ProfileSettingsInput) => Promise<Profile>;
  sendKidMessage: (profileId: string, prompt: string) => Promise<SendMessageResult>;
  sendParentMessage: (profileId: string, prompt: string) => Promise<SendMessageResult>;
  onBitDelta: (handler: (event: BitDeltaEvent) => void) => () => void;
  listProjectSlugs: (profileId: string) => Promise<string[]>;
  listProjectFiles: (profileId: string, slug: string) => Promise<string[]>;
  readProjectFile: (profileId: string, slug: string, filename: string) => Promise<ProjectFile>;
  writeProjectFile: (
    profileId: string,
    slug: string,
    filename: string,
    content: string,
  ) => Promise<void>;
  openProjectFolder: (profileId: string, slug: string) => Promise<OpenProjectFolderResult>;
  subscribeProjectFiles: (
    profileId: string,
    slug: string,
    onChange: (change: ProjectFileChange) => void,
  ) => Promise<ProjectFileSubscription>;
  getProgress: (profileId: string) => Promise<Progress>;
  updateKpStatus: (
    profileId: string,
    kpId: string,
    status: KnowledgePointStatus | null,
    evidence?: string,
  ) => Promise<Progress>;
  updateKpSkipped: (profileId: string, kpId: string, skipped: boolean) => Promise<Progress>;
  getSessionLog: (profileId: string) => Promise<HarnessInvocationLogEntry[]>;
  getTranscript: (profileId: string, sessionId: string) => Promise<TranscriptEvent[]>;
  hasParentPin: () => Promise<boolean>;
  setParentPin: (pin: string) => Promise<void>;
  verifyParentPin: (pin: string) => Promise<boolean>;
  clearParentPin: () => Promise<void>;
  listFlags: (profileId: string) => Promise<ParentFlag[]>;
  writeFlag: (profileId: string, flag: ParentFlag) => Promise<string>;
  deleteFlag: (profileId: string, flag: ParentFlag) => Promise<void>;
};

declare global {
  interface Window {
    hibit: HiBitApi;
  }
}
