import { spawn as nodeSpawn } from "node:child_process";
import { connect, createServer } from "node:net";
import type { PreviewInfo } from "@shared/chat";

/** The slice of a spawned child the service relies on, so tests can fake it. */
export interface PreviewChild {
  pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean;
  on(event: string, listener: (...args: unknown[]) => void): void;
}

export type SpawnLike = (
  command: string,
  options: { cwd: string; env: NodeJS.ProcessEnv },
) => PreviewChild;

export type PreviewServiceOptions = {
  /** Where a creation's files live - the cwd a preview command runs in. */
  resolveWorkbenchDir: (profileId: string, projectId: string) => string;
  spawn?: SpawnLike;
  /**
   * Allocate a free loopback port, trying `preferred` first. The default scans a
   * quiet band so a creation keeps a stable origin (see {@link allocatePort}).
   */
  findFreePort?: (preferred: number) => Promise<number>;
  waitForPort?: (port: number) => Promise<void>;
  terminate?: (child: PreviewChild) => void;
  onStopped?: (preview: PreviewInfo & { profileId: string }) => void;
  /** The port this creation used last time, if any, so its origin stays stable. */
  loadStablePort?: (
    profileId: string,
    projectId: string,
  ) => Promise<number | undefined> | number | undefined;
  /** Remember a newly allocated port so the next launch reuses the same origin. */
  saveStablePort?: (profileId: string, projectId: string, port: number) => Promise<void> | void;
  now?: () => Date;
};

type PreviewProcess = PreviewInfo & {
  profileId: string;
  port: number;
  child: PreviewChild;
};

/**
 * Owns the per-creation preview servers. Hi-Bit spawns each command directly
 * (not via the agent's bash, which blocks until exit) so it can track the PID,
 * health-check the port before reporting ready, and kill the tree on stop or
 * quit. Many previews can run at once; Bit decides which, Hi-Bit owns the
 * processes. Keyed by projectId, which is globally unique.
 */
export class PreviewService {
  private readonly running = new Map<string, PreviewProcess>();
  private readonly starting = new Map<string, Promise<PreviewInfo>>();
  private readonly resolveWorkbenchDir: (profileId: string, projectId: string) => string;
  private readonly spawn: SpawnLike;
  private readonly findFreePort: (preferred: number) => Promise<number>;
  private readonly waitForPort: (port: number) => Promise<void>;
  private readonly terminate: (child: PreviewChild) => void;
  private readonly onStopped?: (preview: PreviewInfo & { profileId: string }) => void;
  private readonly loadStablePort?: PreviewServiceOptions["loadStablePort"];
  private readonly saveStablePort?: PreviewServiceOptions["saveStablePort"];
  private readonly now: () => Date;

  constructor(options: PreviewServiceOptions) {
    this.resolveWorkbenchDir = options.resolveWorkbenchDir;
    this.spawn = options.spawn ?? defaultSpawn;
    this.findFreePort = options.findFreePort ?? allocatePort;
    this.waitForPort = options.waitForPort ?? waitForPort;
    this.terminate = options.terminate ?? terminateTree;
    this.onStopped = options.onStopped;
    this.loadStablePort = options.loadStablePort;
    this.saveStablePort = options.saveStablePort;
    this.now = options.now ?? (() => new Date());
  }

  async start(
    profileId: string,
    projectId: string,
    command: string,
    title?: string,
  ): Promise<PreviewInfo> {
    const existing = this.running.get(projectId);
    if (existing) return toInfo(existing);
    const pending = this.starting.get(projectId);
    if (pending) return pending;

    const start = this.startFresh(profileId, projectId, command, title);
    this.starting.set(projectId, start);
    try {
      return await start;
    } finally {
      if (this.starting.get(projectId) === start) this.starting.delete(projectId);
    }
  }

  private async startFresh(
    profileId: string,
    projectId: string,
    command: string,
    title?: string,
  ): Promise<PreviewInfo> {
    // Prefer the port this creation used last time (falling back to a port
    // derived from its id), then bind it if free. Keeping the same port keeps the
    // same loopback origin, so a game's localStorage save survives across plays.
    const remembered = await this.loadStablePort?.(profileId, projectId);
    const preferred = remembered ?? preferredPreviewPort(projectId);
    const port = await this.findFreePort(preferred);
    if (port !== remembered) {
      try {
        await this.saveStablePort?.(profileId, projectId, port);
      } catch {
        // Persistence is best-effort; a missed save just means we may re-derive
        // the preferred port next launch, not a broken preview.
      }
    }
    const cwd = this.resolveWorkbenchDir(profileId, projectId);
    const child = this.spawn(command, {
      cwd,
      env: { ...process.env, PORT: String(port) },
    });
    const entry: PreviewProcess = {
      profileId,
      projectId,
      title,
      port,
      url: `http://127.0.0.1:${port}/`,
      startedAt: this.now().toISOString(),
      child,
    };
    this.running.set(projectId, entry);
    let started = false;
    let startupSettled = false;
    let rejectStartup: (error: Error) => void = () => {};
    const childFailure = new Promise<never>((_resolve, reject) => {
      rejectStartup = (error) => {
        if (startupSettled) return;
        startupSettled = true;
        reject(error);
      };
    });
    child.on("exit", () => {
      if (this.running.get(projectId) === entry) {
        this.running.delete(projectId);
        if (started) this.onStopped?.(toScopedInfo(entry));
      }
      if (!started) rejectStartup(new Error("Preview server exited before it started"));
    });
    child.on("error", (error) => {
      if (this.running.get(projectId) === entry) {
        this.terminate(child);
        this.running.delete(projectId);
        if (started) this.onStopped?.(toScopedInfo(entry));
      }
      if (!started) rejectStartup(error instanceof Error ? error : new Error(String(error)));
    });

    try {
      await Promise.race([childFailure, this.waitForPort(port)]);
    } catch (error) {
      startupSettled = true;
      this.terminate(child);
      if (this.running.get(projectId) === entry) this.running.delete(projectId);
      throw error;
    }
    startupSettled = true;
    started = true;
    return toInfo(entry);
  }

  stop(projectId: string, profileId?: string): boolean {
    const entry = this.running.get(projectId);
    if (!entry) return false;
    if (profileId && entry.profileId !== profileId) return false;
    this.terminate(entry.child);
    this.running.delete(projectId);
    return true;
  }

  get(projectId: string): PreviewInfo | undefined {
    const entry = this.running.get(projectId);
    return entry ? toInfo(entry) : undefined;
  }

  list(profileId?: string): PreviewInfo[] {
    return [...this.running.values()]
      .filter((entry) => !profileId || entry.profileId === profileId)
      .map(toInfo);
  }

  stopAll(): void {
    for (const entry of this.running.values()) this.terminate(entry.child);
    this.running.clear();
  }
}

function toInfo(entry: PreviewProcess): PreviewInfo {
  return {
    projectId: entry.projectId,
    title: entry.title,
    url: entry.url,
    startedAt: entry.startedAt,
  };
}

function toScopedInfo(entry: PreviewProcess): PreviewInfo & { profileId: string } {
  return { ...toInfo(entry), profileId: entry.profileId };
}

function defaultSpawn(
  command: string,
  options: { cwd: string; env: NodeJS.ProcessEnv },
): PreviewChild {
  return nodeSpawn(command, {
    cwd: options.cwd,
    env: options.env,
    shell: true,
    // Own process group so we can kill the whole tree (shell -c spawns children).
    detached: process.platform !== "win32",
    stdio: "ignore",
  });
}

/**
 * The band we draw preview ports from: high registered ports that are quiet on a
 * regular machine. The upper bound stays below the macOS ephemeral floor (49152,
 * `net.inet.ip.portrange.first`) so the OS never hands one of our ports to a
 * transient outbound socket while a creation is idle, and the lower bound clears
 * the usual dev-tool clutter (3000, 5173, 8080, 9222, ...). MAX is exclusive.
 */
export const PREVIEW_PORT_MIN = 40000;
export const PREVIEW_PORT_MAX = 49000;

/**
 * A deterministic in-band port for a creation, derived from its id (FNV-1a). The
 * same creation maps to the same port every launch, so its preview keeps a stable
 * `http://127.0.0.1:<port>/` origin - which is what lets the game's localStorage
 * persist - while different creations spread across the band and stay isolated.
 */
export function preferredPreviewPort(projectId: string): number {
  let hash = 2166136261; // FNV-1a 32-bit offset basis
  for (let i = 0; i < projectId.length; i++) {
    hash ^= projectId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const span = PREVIEW_PORT_MAX - PREVIEW_PORT_MIN;
  return PREVIEW_PORT_MIN + ((hash >>> 0) % span);
}

/**
 * Bind `preferred` if it is free, otherwise scan forward through the band (and
 * only as a last resort, when the whole band is busy, let the OS pick any port).
 */
async function allocatePort(preferred: number): Promise<number> {
  if (await isPortFree(preferred)) return preferred;
  const span = PREVIEW_PORT_MAX - PREVIEW_PORT_MIN;
  const seed = (((preferred - PREVIEW_PORT_MIN) % span) + span) % span;
  for (let i = 1; i < span; i++) {
    const port = PREVIEW_PORT_MIN + ((seed + i) % span);
    if (await isPortFree(port)) return port;
  }
  return osAssignedPort();
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function osAssignedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error("Could not allocate a port"))));
    });
  });
}

async function waitForPort(port: number, timeoutMs = 30000, intervalMs = 150): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await tryConnect(port);
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`Preview server did not start on port ${port}`);
      }
      await delay(intervalMs);
    }
  }
}

function tryConnect(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function terminateTree(child: PreviewChild): void {
  if (child.pid && process.platform !== "win32") {
    try {
      // Negative pid signals the whole process group spawned under the shell.
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // Group gone or unsupported - fall back to a direct kill.
    }
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // Already dead; nothing to do.
  }
}
