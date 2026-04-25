import { spawn as nodeSpawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SendMessageResult } from "@shared/chat";
import type { HiBitConfig } from "@shared/config";
import type { DreamValidation } from "@shared/dreams";
import type { ParentFlag } from "@shared/flag";
import type { AppInfo, OpenProjectFolderResult, Platform } from "@shared/ipc";
import type { KnowledgeGraphValidation } from "@shared/knowledgeGraph";
import {
  DEFAULT_SESSION_TARGET_MINUTES,
  type ProfileInput,
  type ProfileSettingsInput,
} from "@shared/profile";
import type { KnowledgePointStatus, Progress } from "@shared/progress";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { loadDreams } from "./graph/dreams";
import { loadKnowledgeGraph } from "./graph/load";
import { sendKidMessage, sendParentMessage } from "./harness/chat";
import type { ClaudeSession } from "./harness/claudeSession";
import { ClaudeSessionRegistry } from "./harness/claudeSessionRegistry";
import { detectHarnesses } from "./harness/detect";
import { loadOrInitConfig, writeConfig } from "./storage/config";
import { deleteFlag, loadFlags, writeFlag } from "./storage/flags";
import { seedGraph } from "./storage/graphSeed";
import { bootstrapLayout, type HiBitLayout, profilePathsFor } from "./storage/layout";
import { clearParentPin, hasParentPin, setParentPin, verifyParentPin } from "./storage/parentPin";
import {
  createProfile,
  deleteProfile,
  exportProfile,
  listProfiles,
  readProfile,
  readProgress,
  setCurrentDream,
  updateKpSkipped,
  updateKpStatus,
  updateProfileSettings,
  upsertProjectEntry,
} from "./storage/profiles";
import {
  listProjectFiles,
  listProjectSlugs,
  type ProjectFileChange,
  readProjectFile,
  resolveProjectDir,
  scaffoldProject,
  watchProjectFiles,
  writeProjectFile,
} from "./storage/projects";
import { createProjectWatcherRegistry } from "./storage/projectWatchRegistry";
import { seedBitPrompt } from "./storage/prompts";
import { readSessionLogEntries } from "./storage/sessionLog";
import {
  computeCurrentSession,
  summarizeSessionLog,
  updateStateMdCurrentDream,
  updateStateMdCurrentSession,
  updateStateMdFlags,
  updateStateMdParentNotes,
  updateStateMdProfile,
  updateStateMdRecentParentDirectives,
  updateStateMdRecentSessionSummaries,
  updateStateMdVoicePreferences,
} from "./storage/stateFile";
import { appendTranscriptEvent, buildDreamSwitchEvent, readTranscript } from "./storage/transcript";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isDev = !app.isPackaged;

function hiBitRootFor(): string {
  return join(app.getPath("userData"), ".hi-bit");
}

function shippedRoot(): string {
  return isDev ? app.getAppPath() : process.resourcesPath;
}

function shippedBitPromptPath(): string {
  return join(shippedRoot(), "prompts", "bit.md");
}

function shippedGraphDir(): string {
  return join(shippedRoot(), "graph");
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
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
    win.maximize();
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

const PARENT_DIRECTIVES_LIMIT = 10;
const SESSION_SUMMARIES_LIMIT = 5;

async function syncParentDirectivesToStateMd(
  layout: HiBitLayout,
  profileId: string,
): Promise<void> {
  const profile = await readProfile(layout, profileId);
  if (!profile) return;
  const paths = profilePathsFor(layout, profileId);
  const transcript = await readTranscript(paths, profile.sessions.parent);
  const directives = transcript
    .filter((e) => e.kind === "user_message" && e.role === "parent")
    .slice(-PARENT_DIRECTIVES_LIMIT);
  await updateStateMdRecentParentDirectives(paths, directives);
}

async function syncSessionSummariesToStateMd(
  layout: HiBitLayout,
  profileId: string,
): Promise<void> {
  const paths = profilePathsFor(layout, profileId);
  const entries = await readSessionLogEntries(paths);
  const summaries = summarizeSessionLog(entries).slice(-SESSION_SUMMARIES_LIMIT);
  await updateStateMdRecentSessionSummaries(paths, summaries);
}

async function syncCurrentSessionToStateMd(
  layout: HiBitLayout,
  profileId: string,
  role: "kid" | "parent",
): Promise<void> {
  const profile = await readProfile(layout, profileId);
  if (!profile) return;
  const paths = profilePathsFor(layout, profileId);
  const entries = await readSessionLogEntries(paths);
  const session = computeCurrentSession(entries, { role, now: Date.now() });
  const targetMinutes = profile.sessionTargetMinutes ?? DEFAULT_SESSION_TARGET_MINUTES;
  await updateStateMdCurrentSession(paths, session, targetMinutes);
}

export function projectFileChangeChannel(id: number): string {
  return `hibit:project-file-changed:${id}`;
}

function registerIpc(layout: HiBitLayout): void {
  const projectWatchers = createProjectWatcherRegistry();
  const claudeRegistry = new ClaudeSessionRegistry<ClaudeSession>();
  app.on("before-quit", () => claudeRegistry.closeAll());
  ipcMain.handle("hibit:get-app-info", (): AppInfo => {
    return {
      version: app.getVersion(),
      platform: process.platform as Platform,
      userDataDir: app.getPath("userData"),
      hiBitDir: layout.root,
    };
  });

  ipcMain.handle("hibit:list-profiles", () => listProfiles(layout));

  ipcMain.handle("hibit:create-profile", (_event, input: ProfileInput) =>
    createProfile(layout, input),
  );

  ipcMain.handle("hibit:delete-profile", (_event, profileId: string) => {
    claudeRegistry.closeProfile(profileId);
    return deleteProfile(layout, profileId);
  });

  ipcMain.handle(
    "hibit:export-profile",
    async (event, profileId: string): Promise<string | null> => {
      const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const result = await (parentWindow
        ? dialog.showOpenDialog(parentWindow, {
            title: "Choose export destination",
            properties: ["openDirectory", "createDirectory"],
          })
        : dialog.showOpenDialog({
            title: "Choose export destination",
            properties: ["openDirectory", "createDirectory"],
          }));
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return exportProfile(layout, profileId, result.filePaths[0]);
    },
  );

  ipcMain.handle("hibit:get-config", () => loadOrInitConfig(layout));

  ipcMain.handle("hibit:update-config", async (_event, config: HiBitConfig) => {
    await writeConfig(layout, config);
    return loadOrInitConfig(layout);
  });

  ipcMain.handle("hibit:detect-harnesses", () => detectHarnesses());

  ipcMain.handle(
    "hibit:get-knowledge-graph",
    (): Promise<KnowledgeGraphValidation> => loadKnowledgeGraph(layout.graphNodesDir),
  );

  ipcMain.handle("hibit:get-dreams", async (): Promise<DreamValidation> => {
    const graphResult = await loadKnowledgeGraph(layout.graphNodesDir);
    const graph = graphResult.ok ? graphResult.graph : { nodes: [], byId: {} };
    return loadDreams(layout.graphDreamsDir, graph);
  });

  ipcMain.handle(
    "hibit:update-profile-settings",
    async (_event, profileId: string, settings: ProfileSettingsInput) => {
      const profile = await updateProfileSettings(layout, profileId, settings);
      const paths = profilePathsFor(layout, profileId);
      await updateStateMdVoicePreferences(paths, {
        sessionTargetMinutes: profile.sessionTargetMinutes,
        voicePreferences: profile.voicePreferences,
      });
      if (settings.notes !== undefined) {
        await updateStateMdParentNotes(paths, profile.notes);
      }
      if (settings.interests !== undefined) {
        await updateStateMdProfile(paths, {
          name: profile.name,
          age: profile.age,
          interests: profile.interests,
        });
      }
      return profile;
    },
  );

  ipcMain.handle("hibit:set-current-dream", async (_event, profileId: string, dreamId: string) => {
    const prior = await readProfile(layout, profileId);
    const priorDreamId = prior?.currentDreamId ?? null;
    const profile = await setCurrentDream(layout, profileId, dreamId);
    const graphResult = await loadKnowledgeGraph(layout.graphNodesDir);
    const graph = graphResult.ok ? graphResult.graph : { nodes: [], byId: {} };
    const dreamResult = await loadDreams(layout.graphDreamsDir, graph);
    const dream = dreamResult.ok ? dreamResult.library.byId[dreamId] : undefined;
    const paths = profilePathsFor(layout, profileId);
    if (dream) {
      await scaffoldProject(paths, dream, { profileName: profile.name });
      await updateStateMdCurrentDream(paths, dream);
      await upsertProjectEntry(layout, profileId, dream.id, dream.id);
    }
    if (dream && priorDreamId && priorDreamId !== dream.id) {
      await appendTranscriptEvent(
        paths,
        buildDreamSwitchEvent({
          timestamp: new Date().toISOString(),
          sessionId: profile.sessions.kid,
          role: "kid",
          dreamId: dream.id,
          dreamTitleKid: dream.title_kid,
        }),
      );
    }
    return profile;
  });

  ipcMain.handle(
    "hibit:send-kid-message",
    async (event, profileId: string, prompt: string): Promise<SendMessageResult> => {
      const config = await loadOrInitConfig(layout);
      const detection = await detectHarnesses();
      const result = await sendKidMessage({
        layout,
        config,
        detection,
        profileId,
        prompt,
        spawn: nodeSpawn,
        claudeRegistry,
        onDelta: (text) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("hibit:bit-delta", { role: "kid", profileId, text });
          }
        },
      });
      await syncSessionSummariesToStateMd(layout, profileId);
      await syncCurrentSessionToStateMd(layout, profileId, "kid");
      return result;
    },
  );

  ipcMain.handle(
    "hibit:send-parent-message",
    async (event, profileId: string, prompt: string): Promise<SendMessageResult> => {
      const config = await loadOrInitConfig(layout);
      const detection = await detectHarnesses();
      const result = await sendParentMessage({
        layout,
        config,
        detection,
        profileId,
        prompt,
        spawn: nodeSpawn,
        claudeRegistry,
        onDelta: (text) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("hibit:bit-delta", { role: "parent", profileId, text });
          }
        },
      });
      await syncParentDirectivesToStateMd(layout, profileId);
      await syncSessionSummariesToStateMd(layout, profileId);
      await syncCurrentSessionToStateMd(layout, profileId, "parent");
      return result;
    },
  );

  ipcMain.handle("hibit:list-project-slugs", (_event, profileId: string) =>
    listProjectSlugs(profilePathsFor(layout, profileId)),
  );

  ipcMain.handle("hibit:list-project-files", (_event, profileId: string, slug: string) =>
    listProjectFiles(profilePathsFor(layout, profileId), slug),
  );

  ipcMain.handle(
    "hibit:read-project-file",
    async (_event, profileId: string, slug: string, filename: string) => {
      const content = await readProjectFile(profilePathsFor(layout, profileId), slug, filename);
      return { name: filename, content };
    },
  );

  ipcMain.handle(
    "hibit:write-project-file",
    async (_event, profileId: string, slug: string, filename: string, content: string) => {
      await writeProjectFile(profilePathsFor(layout, profileId), slug, filename, content);
      await upsertProjectEntry(layout, profileId, slug, slug);
    },
  );

  ipcMain.handle(
    "hibit:open-project-folder",
    async (_event, profileId: string, slug: string): Promise<OpenProjectFolderResult> => {
      try {
        const dir = await resolveProjectDir(profilePathsFor(layout, profileId), slug);
        const failure = await shell.openPath(dir);
        return failure === "" ? { ok: true, path: dir } : { ok: false, path: dir, error: failure };
      } catch (err) {
        return {
          ok: false,
          path: "",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(
    "hibit:watch-project-files",
    async (event, profileId: string, slug: string): Promise<number> => {
      const paths = profilePathsFor(layout, profileId);
      const sender = event.sender;
      let dispatch: ((change: ProjectFileChange) => void) | null = null;
      const watcher = await watchProjectFiles(paths, slug, (change) => {
        dispatch?.(change);
      });
      const id = projectWatchers.register(watcher);
      const channel = projectFileChangeChannel(id);
      dispatch = (change) => {
        if (!sender.isDestroyed()) {
          sender.send(channel, change);
        }
      };
      sender.once("destroyed", () => {
        projectWatchers.close(id);
      });
      return id;
    },
  );

  ipcMain.handle("hibit:unwatch-project-files", (_event, id: number) => {
    projectWatchers.close(id);
  });

  ipcMain.handle(
    "hibit:get-progress",
    (_event, profileId: string): Promise<Progress> => readProgress(layout, profileId),
  );

  ipcMain.handle(
    "hibit:update-kp-status",
    (
      _event,
      profileId: string,
      kpId: string,
      status: KnowledgePointStatus | null,
      evidence?: string,
    ): Promise<Progress> => updateKpStatus(layout, profileId, kpId, status, { evidence }),
  );

  ipcMain.handle(
    "hibit:update-kp-skipped",
    (_event, profileId: string, kpId: string, skipped: boolean): Promise<Progress> =>
      updateKpSkipped(layout, profileId, kpId, skipped),
  );

  ipcMain.handle("hibit:get-session-log", (_event, profileId: string) =>
    readSessionLogEntries(profilePathsFor(layout, profileId)),
  );

  ipcMain.handle("hibit:get-transcript", (_event, profileId: string, sessionId: string) =>
    readTranscript(profilePathsFor(layout, profileId), sessionId),
  );

  ipcMain.handle("hibit:has-parent-pin", () => hasParentPin(layout));

  ipcMain.handle("hibit:set-parent-pin", async (_event, pin: string) => {
    await setParentPin(layout, pin);
  });

  ipcMain.handle("hibit:verify-parent-pin", (_event, pin: string) => verifyParentPin(layout, pin));

  ipcMain.handle("hibit:clear-parent-pin", () => clearParentPin(layout));

  ipcMain.handle("hibit:list-flags", (_event, profileId: string) =>
    loadFlags(profilePathsFor(layout, profileId)),
  );

  ipcMain.handle("hibit:write-flag", async (_event, profileId: string, flag: ParentFlag) => {
    const paths = profilePathsFor(layout, profileId);
    const name = await writeFlag(paths, flag);
    const flags = await loadFlags(paths);
    await updateStateMdFlags(paths, flags);
    return name;
  });

  ipcMain.handle("hibit:delete-flag", async (_event, profileId: string, flag: ParentFlag) => {
    const paths = profilePathsFor(layout, profileId);
    await deleteFlag(paths, flag);
    const flags = await loadFlags(paths);
    await updateStateMdFlags(paths, flags);
  });
}

void app.whenReady().then(async () => {
  const layout = await bootstrapLayout(hiBitRootFor());
  await seedBitPrompt(layout, shippedBitPromptPath());
  await seedGraph(layout, shippedGraphDir());
  await loadOrInitConfig(layout);
  registerIpc(layout);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // In dev, closing the window should also tear down `npm run dev` so the
  // Vite server doesn't keep running headless. In production, keep the
  // macOS convention of staying alive in the dock.
  if (isDev || process.platform !== "darwin") {
    app.quit();
  }
});
