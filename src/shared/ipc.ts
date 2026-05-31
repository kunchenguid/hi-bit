import type { AuthStatus } from "./auth";
import type { ChatEvent, ChatSnapshot, PreviewInfo, SendMessageResult } from "./chat";
import type { ProfileInput, ProfileSettingsInput, ProfileSummary } from "./profile";
import type { CreateProjectInput, ProjectSummary } from "./project";

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

export type Unsubscribe = () => void;

export type HiBitApi = {
  app: {
    info: () => Promise<AppInfo>;
  };
  auth: {
    status: () => Promise<AuthStatus>;
    login: () => Promise<AuthStatus>;
    logout: () => Promise<void>;
  };
  profiles: {
    list: () => Promise<ProfileSummary[]>;
    create: (input: ProfileInput) => Promise<ProfileSummary>;
    update: (profileId: string, settings: ProfileSettingsInput) => Promise<ProfileSummary>;
    getActiveId: () => Promise<string | null>;
    setActiveId: (profileId: string | null) => Promise<void>;
  };
  projects: {
    list: (profileId: string) => Promise<ProjectSummary[]>;
    create: (profileId: string, input: CreateProjectInput) => Promise<ProjectSummary>;
    openFolder: (profileId: string) => Promise<void>;
  };
  chat: {
    load: (profileId: string) => Promise<ChatSnapshot>;
    send: (profileId: string, text: string) => Promise<SendMessageResult>;
    abort: (profileId: string) => Promise<void>;
    /** Records that the kid opened "See all activities", so the Logbook word can unlock. */
    markActivitiesOpened: (profileId: string) => Promise<void>;
    onEvent: (listener: (event: ChatEvent) => void) => Unsubscribe;
  };
  preview: {
    play: (profileId: string, projectId: string) => Promise<PreviewInfo>;
    openExternal: (url: string) => Promise<void>;
    /** Empties the HTTP cache so a preview reload refetches rebuilt files fresh. */
    clearCache: () => Promise<void>;
  };
};

declare global {
  interface Window {
    hibit: HiBitApi;
  }
}
