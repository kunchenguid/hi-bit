import type { AuthStatus } from "./auth";
import type { ChatEvent, ChatSnapshot, SendMessageResult } from "./chat";
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
  projects: {
    list: () => Promise<ProjectSummary[]>;
    create: (input: CreateProjectInput) => Promise<ProjectSummary>;
    openFolder: (projectId: string) => Promise<void>;
  };
  chat: {
    load: (projectId: string) => Promise<ChatSnapshot>;
    send: (projectId: string, text: string) => Promise<SendMessageResult>;
    abort: (projectId: string) => Promise<void>;
    onEvent: (listener: (event: ChatEvent) => void) => Unsubscribe;
  };
};

declare global {
  interface Window {
    hibit: HiBitApi;
  }
}
