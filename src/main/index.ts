import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatEvent } from "@shared/chat";
import { DEFAULT_CODEX_MODEL, type HiBitConfig, normalizeHiBitConfig } from "@shared/config";
import type { AppInfo, Platform } from "@shared/ipc";
import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import { CodexAuthService, createSafeStorageTokenCodec } from "./auth/codexAuth";
import { BitCoordinatorService } from "./bit/bitCoordinatorService";
import { PiRuntimeService } from "./pi/piRuntimeService";
import { ProfileService } from "./profiles/profileService";
import { ProjectService } from "./projects/projectService";
import { readJsonFile } from "./storage/json";
import { bootstrapLayout, type HiBitLayout } from "./storage/layout";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

type Services = {
  layout: HiBitLayout;
  auth: CodexAuthService;
  profiles: ProfileService;
  projects: ProjectService;
  bit: BitCoordinatorService;
  runtime: PiRuntimeService;
};

function hiBitRootFor(): string {
  return join(app.getPath("userData"), ".hi-bit");
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
  });
  const profiles = new ProfileService(layout);
  const projects = new ProjectService(layout);
  const runtime = new PiRuntimeService({
    agentDir: layout.piAgentDir,
    modelId: modelIdFromConfig(config.defaultModel),
    getFreshAccessToken: () => auth.getFreshAccessToken(),
  });
  const bit = new BitCoordinatorService({ profiles, projects, runtime });
  return { layout, auth, profiles, projects, bit, runtime };
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
    services.runtime.disposeAll();
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
  ipcMain.handle(
    "hibit:projects:open-folder",
    async (_event, profileId: string, projectId: string) => {
      const project = await services.projects.get(profileId, projectId);
      const failure = await shell.openPath(project.mainWorkbenchDir);
      if (failure) throw new Error(failure);
    },
  );

  ipcMain.handle("hibit:chat:load", (_event, profileId: string, projectId: string) =>
    services.bit.load(profileId, projectId),
  );
  ipcMain.handle(
    "hibit:chat:send",
    async (event, profileId: string, projectId: string, text: string) => {
      const sendEvent = (payload: ChatEvent) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send("hibit:chat:event", payload);
        }
      };
      return services.bit.send(profileId, projectId, text, sendEvent);
    },
  );
  ipcMain.handle("hibit:chat:abort", (_event, profileId: string, projectId: string) =>
    services.bit.abort(profileId, projectId),
  );
}

void app.whenReady().then(async () => {
  const layout = await bootstrapLayout(hiBitRootFor());
  const services = await createServices(layout);
  registerIpc(services);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });

  app.once("before-quit", () => {
    services.runtime.disposeAll();
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
