import type { AuthStatus } from "./auth";
import type { BrowserState, BrowserTab, SpotlightRect } from "./browser";
import type {
  ChatEvent,
  ChatSnapshot,
  OutgoingImage,
  PreviewInfo,
  SendMessageResult,
} from "./chat";
import type { ProfileInput, ProfileSettingsInput, ProfileSummary } from "./profile";
import type { CreateProjectInput, ProjectSummary } from "./project";
import type { VoiceDownloadProgress, VoiceStatus } from "./voice";

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
    /**
     * Fires when a Codex token refresh is rejected mid-session, so the renderer
     * can surface the blocking reconnect overlay without unmounting the chat.
     */
    onReconnectRequired: (listener: () => void) => Unsubscribe;
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
    send: (profileId: string, text: string, image?: OutgoingImage) => Promise<SendMessageResult>;
    abort: (profileId: string) => Promise<void>;
    /** Records that the kid opened the Logbook, so the word can unlock. */
    markActivitiesOpened: (profileId: string) => Promise<void>;
    onEvent: (listener: (event: ChatEvent) => void) => Unsubscribe;
  };
  preview: {
    play: (profileId: string, projectId: string) => Promise<PreviewInfo>;
    openExternal: (url: string) => Promise<void>;
    /** Empties the HTTP cache so a preview reload refetches rebuilt files fresh. */
    clearCache: () => Promise<void>;
  };
  /**
   * The in-app browser. Tab state is owned in main and mirrored here via
   * `onState`; the renderer renders one sandboxed iframe per tab and reports a
   * tab's load back so a tool's navigate can resolve. `onSpotlight` drives the
   * tutorial highlight overlay (null clears it).
   */
  browser: {
    state: () => Promise<BrowserState>;
    open: (url?: string) => Promise<BrowserTab>;
    close: (tabId: string) => Promise<void>;
    switch: (tabId: string) => Promise<void>;
    navigate: (url: string) => Promise<void>;
    reload: () => Promise<void>;
    /** Renderer -> main: an iframe finished loading (resolves pending navigates). */
    reportTabLoaded: (tabId: string, url: string, title?: string) => void;
    onState: (listener: (state: BrowserState) => void) => Unsubscribe;
    onSpotlight: (listener: (rect: SpotlightRect | null) => void) => Unsubscribe;
  };
  /**
   * Local, on-device speech-to-text (Whisper). The renderer gates the feature on
   * WebGPU itself; these calls cover the one-time model download. Transcription
   * runs in a renderer worker, not over IPC - only text reaches `chat.send`.
   */
  voice: {
    /** Whether the model is fully downloaded to userData. */
    status: () => Promise<VoiceStatus>;
    /** Downloads the model if missing; resolves once it is ready. */
    ensureModel: () => Promise<void>;
    /** Streams download progress while `ensureModel` runs. */
    onDownloadProgress: (listener: (progress: VoiceDownloadProgress) => void) => Unsubscribe;
  };
};

declare global {
  interface Window {
    hibit: HiBitApi;
  }
}
