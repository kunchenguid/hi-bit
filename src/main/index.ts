import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ChatEvent, OutgoingImage } from "@shared/chat";
import { DEFAULT_CODEX_MODEL, type HiBitConfig, normalizeHiBitConfig } from "@shared/config";
import type { AppInfo, Platform } from "@shared/ipc";
import { app, BrowserWindow, ipcMain, safeStorage, session, shell } from "electron";
import { CodexAuthService, createSafeStorageTokenCodec } from "./auth/codexAuth";
import { BitCoordinatorService } from "./bit/bitCoordinatorService";
import { ConversationService } from "./conversation/conversationService";
import { BitRuntimeService } from "./pi/bitRuntimeService";
import { PiRuntimeService } from "./pi/piRuntimeService";
import { PreviewService } from "./preview/previewService";
import { ProfileService } from "./profiles/profileService";
import { ProjectService } from "./projects/projectService";
import { readJsonFile } from "./storage/json";
import { bootstrapLayout, type HiBitLayout } from "./storage/layout";
import { seedCodexAuthIfMissing } from "./storage/seedAuth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// The real, default userData dir - captured before any override so it can also
// be the seed source for Codex auth in isolated dev runs.
const defaultUserDataDir = app.getPath("userData");

/**
 * In dev, an isolated userData dir can be requested via `HIBIT_USER_DATA_DIR`
 * so agent-driven E2E runs get a fresh profiles/projects state without touching
 * real data. Ignored in packaged builds. When set, Codex auth is seeded from
 * the real userData (see startup) so the app starts past the sign-in gate that
 * an agent can't clear on its own.
 */
const isolatedUserDataDir =
  !app.isPackaged && process.env.HIBIT_USER_DATA_DIR?.trim()
    ? process.env.HIBIT_USER_DATA_DIR.trim()
    : null;

type Services = {
  layout: HiBitLayout;
  auth: CodexAuthService;
  profiles: ProfileService;
  projects: ProjectService;
  conversation: ConversationService;
  bit: BitCoordinatorService;
  runtime: PiRuntimeService;
  bitRuntime: BitRuntimeService;
  preview: PreviewService;
};

function hiBitRootFor(): string {
  return join(isolatedUserDataDir ?? defaultUserDataDir, ".hi-bit");
}

/**
 * Bundled Hi-Bit skills (e.g. create-2d-game, create-3d-game, game-assets). In dev they live in the repo's
 * `skills/`; packaged, electron-builder copies them to `resourcesPath/skills`
 * (see `extraResources` in electron-builder.yml). The bot reads each
 * SKILL.md on demand, so the directory just needs to be readable on disk.
 */
function skillsDirFor(): string {
  return app.isPackaged ? join(process.resourcesPath, "skills") : join(__dirname, "../../skills");
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#F7F1E5",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;

  if (isDev && devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

async function createServices(layout: HiBitLayout): Promise<Services> {
  const config = normalizeHiBitConfig(await readJsonFile<HiBitConfig>(layout.configPath));
  const auth = new CodexAuthService({
    authPath: layout.codexAuthPath,
    codec: createSafeStorageTokenCodec(safeStorage),
    openExternal: (url) => shell.openExternal(url),
    onReconnectRequired: () => broadcastReconnectRequired(),
  });
  const profiles = new ProfileService(layout);
  const projects = new ProjectService(layout);
  const conversation = new ConversationService(layout);
  const modelId = modelIdFromConfig(config.defaultModel);
  const runtime = new PiRuntimeService({
    agentDir: layout.piAgentDir,
    modelId,
    getFreshAccessToken: () => auth.getFreshAccessToken(),
    skillsDir: skillsDirFor(),
  });
  const bitRuntime = new BitRuntimeService({
    agentDir: layout.piAgentDir,
    modelId,
    getFreshAccessToken: () => auth.getFreshAccessToken(),
    onSessionFile: (profileId, sessionFile) =>
      conversation.setBitSessionFile(profileId, sessionFile),
  });
  const preview = new PreviewService({
    resolveWorkbenchDir: (profileId, projectId) =>
      projects.pathsFor(profileId, projectId).mainWorkbenchDir,
    onStopped: ({ profileId, projectId }) =>
      broadcastChatEvent({ type: "preview_stopped", profileId, projectId }),
  });
  const bit = new BitCoordinatorService({
    profiles,
    projects,
    conversation,
    bit: bitRuntime,
    bot: runtime,
    preview,
  });
  return { layout, auth, profiles, projects, conversation, bit, runtime, bitRuntime, preview };
}

export function registerIpc(services: Services): void {
  ipcMain.handle(
    "hibit:app:info",
    (): AppInfo => ({
      version: app.getVersion(),
      platform: process.platform as Platform,
      userDataDir: app.getPath("userData"),
      hiBitDir: services.layout.root,
    }),
  );

  ipcMain.handle("hibit:auth:status", () => services.auth.status());
  ipcMain.handle("hibit:auth:login", () => services.auth.login());
  ipcMain.handle("hibit:auth:logout", async () => {
    await services.auth.logout();
    services.preview.stopAll();
    services.runtime.disposeAll();
    services.bitRuntime.disposeAll();
  });

  ipcMain.handle("hibit:profiles:list", () => services.profiles.list());
  ipcMain.handle("hibit:profiles:create", (_event, input) => services.profiles.create(input));
  ipcMain.handle("hibit:profiles:update", (_event, profileId: string, settings) =>
    services.profiles.update(profileId, settings),
  );
  ipcMain.handle("hibit:profiles:get-active-id", () => services.profiles.getActiveId());
  ipcMain.handle("hibit:profiles:set-active-id", async (_event, profileId: string | null) => {
    if (profileId) await services.profiles.get(profileId);
    await services.profiles.setActiveId(profileId);
  });

  ipcMain.handle("hibit:projects:list", async (_event, profileId: string) => {
    await services.profiles.get(profileId);
    return services.projects.list(profileId);
  });
  ipcMain.handle("hibit:projects:create", async (_event, profileId: string, input) => {
    await services.profiles.get(profileId);
    return services.projects.create(profileId, input);
  });
  ipcMain.handle("hibit:projects:open-folder", async (_event, profileId: string) => {
    await services.profiles.get(profileId);
    const dir = await services.projects.profileProjectsDir(profileId);
    const failure = await shell.openPath(dir);
    if (failure) throw new Error(failure);
  });

  ipcMain.handle("hibit:chat:load", (_event, profileId: string) => services.bit.load(profileId));
  ipcMain.handle(
    "hibit:chat:send",
    (_event, profileId: string, text: string, image?: OutgoingImage) =>
      services.bit.send(profileId, text, image),
  );
  ipcMain.handle("hibit:chat:abort", (_event, profileId: string) => services.bit.abort(profileId));
  ipcMain.handle("hibit:chat:mark-activities-opened", (_event, profileId: string) =>
    services.bit.markActivitiesOpened(profileId),
  );

  ipcMain.handle("hibit:preview:play", (_event, profileId: string, projectId: string) =>
    services.bit.playPreview(profileId, projectId),
  );

  ipcMain.handle("hibit:preview:open-external", async (_event, url: string) => {
    // Only ever hand the OS a local preview URL - never an arbitrary scheme.
    if (!isLoopbackHttpUrl(url)) throw new Error("Refusing to open a non-preview URL.");
    await shell.openExternal(url);
  });

  // A bot rebuild changes a creation's files on disk, but its preview server keeps
  // the same URL and port. Chromium caches that origin's responses (the static
  // servers send no Cache-Control), so remounting the preview iframe would just
  // replay the stale bytes - the kid sees the old creation while "Open in browser"
  // (a fresh process) shows the new one. Emptying the renderer session's HTTP
  // cache before a reload forces the iframe to refetch the rebuilt files and all
  // their subresources. The renderer itself loads from file:// (prod) or the Vite
  // dev server, so clearing the HTTP cache costs nothing there.
  ipcMain.handle("hibit:preview:clear-cache", () => session.defaultSession.clearCache());
}

/**
 * Grants renderer-only browser permissions for camera and clipboard picture input.
 */
function configureMediaPermission(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      callback(isAllowedAppRendererPermission(permission, details.requestingUrl));
    },
  );
  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin, details) => {
      return isAllowedAppRendererPermission(
        permission,
        permissionRequestingSource(requestingOrigin, details),
      );
    },
  );
}

export function permissionRequestingSource(
  requestingOrigin: string | undefined,
  details?: { requestingUrl?: string },
): string | undefined {
  return details?.requestingUrl ?? requestingOrigin;
}

export function isAllowedAppRendererPermission(
  permission: string,
  requestingSource: string | undefined,
): boolean {
  return (
    (permission === "media" || permission === "clipboard-read") &&
    isAppRendererSource(requestingSource)
  );
}

export function isAppRendererSource(
  value: string | undefined,
  bundledRendererFile = join(__dirname, "../renderer/index.html"),
): boolean {
  if (!value) return false;
  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  try {
    const url = new URL(value);
    if (devServerUrl && url.origin === new URL(devServerUrl).origin) return true;
    return url.protocol === "file:" && url.href === pathToFileURL(bundledRendererFile).href;
  } catch {
    return false;
  }
}

function isLoopbackHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

function broadcastChatEvent(event: ChatEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send("hibit:chat:event", event);
    }
  }
}

// Tells every renderer that the Codex refresh token is dead and the kid must
// reconnect. The renderer answers by overlaying the blocking reconnect modal,
// keeping the live chat mounted underneath so no in-flight state is lost.
function broadcastReconnectRequired(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send("hibit:auth:reconnect-required");
    }
  }
}

void app.whenReady().then(async () => {
  const layout = await bootstrapLayout(hiBitRootFor());
  if (isolatedUserDataDir) {
    // Inherit the real Codex auth into the fresh dir so the app starts signed
    // in. Only fills a missing file; a separately signed-in isolated dir wins.
    const result = await seedCodexAuthIfMissing({
      sourcePath: join(defaultUserDataDir, ".hi-bit", "auth", "codex.json"),
      targetPath: layout.codexAuthPath,
    });
    console.log(`[hi-bit] isolated userData at ${isolatedUserDataDir} (codex auth: ${result})`);
  }
  const services = await createServices(layout);
  services.bit.subscribe(broadcastChatEvent);
  registerIpc(services);
  configureMediaPermission();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  app.once("before-quit", () => {
    services.preview.stopAll();
    services.runtime.disposeAll();
    services.bitRuntime.disposeAll();
  });
});

app.on("window-all-closed", () => {
  if (isDev || process.platform !== "darwin") {
    app.quit();
  }
});

function modelIdFromConfig(value: string): string {
  const prefix = "openai-codex/";
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  if (value.trim()) return value.trim();
  return DEFAULT_CODEX_MODEL.slice(prefix.length);
}
