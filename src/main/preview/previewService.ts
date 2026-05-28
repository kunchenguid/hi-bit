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
  findFreePort?: () => Promise<number>;
  waitForPort?: (port: number) => Promise<void>;
  terminate?: (child: PreviewChild) => void;
  onStopped?: (preview: PreviewInfo & { profileId: string }) => void;
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
  private readonly resolveWorkbenchDir: (profileId: string, projectId: string) => string;
  private readonly spawn: SpawnLike;
  private readonly findFreePort: () => Promise<number>;
  private readonly waitForPort: (port: number) => Promise<void>;
  private readonly terminate: (child: PreviewChild) => void;
  private readonly onStopped?: (preview: PreviewInfo & { profileId: string }) => void;
  private readonly now: () => Date;

  constructor(options: PreviewServiceOptions) {
    this.resolveWorkbenchDir = options.resolveWorkbenchDir;
    this.spawn = options.spawn ?? defaultSpawn;
    this.findFreePort = options.findFreePort ?? findFreePort;
    this.waitForPort = options.waitForPort ?? waitForPort;
    this.terminate = options.terminate ?? terminateTree;
    this.onStopped = options.onStopped;
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

    const port = await this.findFreePort();
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

function findFreePort(): Promise<number> {
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
